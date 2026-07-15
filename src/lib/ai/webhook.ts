import type OpenAI from "openai";
import type { Response as OpenAIResponse } from "openai/resources/responses/responses";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MenuImportStagingSchema } from "@/lib/ai/schemas";

type ResponseWebhookType =
  | "response.completed"
  | "response.failed"
  | "response.incomplete"
  | "response.cancelled";

export interface ResponseWebhookEvent {
  id: string;
  type: ResponseWebhookType;
  data: { id: string };
  created_at: number;
}

export interface WebhookRepository {
  claim(input: {
    webhookId: string;
    eventType: string;
    responseId: string | null;
    payload: unknown;
  }): Promise<"claimed" | "retry" | "duplicate">;
  updateJob(
    responseId: string,
    update: {
      status: string;
      output: unknown;
      error: { message: string } | null;
      usage: unknown;
      completed_at: string | null;
    },
  ): Promise<void>;
  complete(webhookId: string): Promise<void>;
  fail(webhookId: string, message: string): Promise<void>;
}

export function createSupabaseWebhookRepository(
  admin: SupabaseClient,
): WebhookRepository {
  return {
    async claim(input) {
      const { data: job, error: jobError } = await admin
        .from("ai_jobs")
        .select("id,organization_id")
        .eq("response_id", input.responseId)
        .maybeSingle();
      if (jobError) {
        throw new Error(`Ricerca job AI non riuscita: ${jobError.message}`);
      }
      if (!job) {
        throw new Error(`Nessun ai_job trovato per la risposta ${input.responseId}.`);
      }

      const { error } = await admin.from("webhook_events").insert({
        organization_id: job.organization_id,
        ai_job_id: job.id,
        webhook_id: input.webhookId,
        event_type: input.eventType,
        response_id: input.responseId,
        payload: input.payload,
        processed_at: null,
        error: null,
      });
      if (!error) return "claimed";
      if (error.code !== "23505") {
        throw new Error(`Registrazione webhook non riuscita: ${error.message}`);
      }

      const { data, error: readError } = await admin
        .from("webhook_events")
        .select("processed_at,error")
        .eq("webhook_id", input.webhookId)
        .maybeSingle();
      if (readError) {
        throw new Error(`Verifica webhook duplicato non riuscita: ${readError.message}`);
      }
      if (!data || data.processed_at || !data.error) return "duplicate";

      const { error: retryError } = await admin
        .from("webhook_events")
        .update({ error: null })
        .eq("webhook_id", input.webhookId)
        .is("processed_at", null);
      if (retryError) {
        throw new Error(`Retry webhook non riuscito: ${retryError.message}`);
      }
      return "retry";
    },

    async updateJob(responseId, update) {
      if (update.status === "review" && update.output) {
        const { data: job, error: jobError } = await admin
          .from("ai_jobs")
          .select("id")
          .eq("response_id", responseId)
          .eq("kind", "menu_import")
          .maybeSingle();
        if (jobError || !job) {
          throw new Error(`Ricerca job AI non riuscita: ${jobError?.message ?? "job assente"}`);
        }
        const { error } = await admin.rpc("record_menu_import_staging", {
          p_job_id: job.id,
          p_payload: update.output,
          p_parser: "openai",
          p_usage: update.usage,
        });
        if (error) throw new Error(`Salvataggio staging AI non riuscito: ${error.message}`);
        return;
      }
      const { data, error } = await admin
        .from("ai_jobs")
        .update(update)
        .eq("response_id", responseId)
        .select("id");
      if (error) throw new Error(`Aggiornamento job AI non riuscito: ${error.message}`);
      if (!data?.length) {
        throw new Error(`Nessun ai_job trovato per la risposta ${responseId}.`);
      }
    },

    async complete(webhookId) {
      const { error } = await admin
        .from("webhook_events")
        .update({ processed_at: new Date().toISOString(), error: null })
        .eq("webhook_id", webhookId);
      if (error) throw new Error(`Chiusura webhook non riuscita: ${error.message}`);
    },

    async fail(webhookId, message) {
      const { error } = await admin
        .from("webhook_events")
        .update({ error: { message }, processed_at: null })
        .eq("webhook_id", webhookId);
      if (error) throw new Error(`Salvataggio errore webhook non riuscito: ${error.message}`);
    },
  };
}

function responseError(response: OpenAIResponse) {
  return (
    response.error?.message ??
    response.incomplete_details?.reason ??
    (response.status === "cancelled" ? "Risposta OpenAI annullata." : null)
  );
}

function jobStatus(responseStatus?: string) {
  if (responseStatus === "completed") return "review";
  if (responseStatus === "queued") return "queued";
  if (responseStatus === "in_progress") return "running";
  return "failed";
}

export async function processResponseWebhook(input: {
  webhookId: string;
  event: ResponseWebhookEvent;
  rawPayload: unknown;
  openai: OpenAI;
  repository: WebhookRepository;
}) {
  const { webhookId, event, rawPayload, openai, repository } = input;
  const claim = await repository.claim({
    webhookId,
    eventType: event.type,
    responseId: event.data.id,
    payload: rawPayload,
  });
  if (claim === "duplicate") return { duplicate: true as const };

  try {
    const response = await openai.responses.retrieve(event.data.id, {
      stream: false,
    });
    let output: unknown = null;
    let errorMessage = responseError(response);
    let status = jobStatus(response.status);

    if (response.status === "completed") {
      try {
        output = MenuImportStagingSchema.parse(JSON.parse(response.output_text));
      } catch (parseError) {
        status = "failed";
        errorMessage =
          parseError instanceof Error
            ? `Output OpenAI non valido: ${parseError.message}`
            : "Output OpenAI non valido.";
      }
    }

    await repository.updateJob(event.data.id, {
      status,
      output,
      error: errorMessage ? { message: errorMessage } : null,
      usage: response.usage ?? null,
      completed_at:
        status === "review" || status === "completed" || status === "failed"
          ? new Date().toISOString()
          : null,
    });
    await repository.complete(webhookId);
    return { duplicate: false as const, status };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore webhook sconosciuto.";
    await repository.fail(webhookId, message);
    throw error;
  }
}

export function isResponseWebhookEvent(value: unknown): value is ResponseWebhookEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<ResponseWebhookEvent>;
  return (
    [
      "response.completed",
      "response.failed",
      "response.incomplete",
      "response.cancelled",
    ].includes(event.type ?? "") &&
    typeof event.id === "string" &&
    typeof event.data?.id === "string"
  );
}
