import type OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createMenuImportBackgroundJob,
  uploadMenuSource,
} from "@/lib/ai/menu-import";
import { MenuImportStagingSchema } from "@/lib/ai/schemas";
import { parseTabularMenu } from "@/lib/import";
import type { MenuImportSourceType } from "@/lib/import/source";
import { createOpenAIClient } from "@/lib/ai/client";
import { createAdminClient } from "@/lib/supabase/admin";

export interface RunMenuImportInput {
  organizationId: string;
  onboardingCaseId: string;
  menuId: string;
  menuName: string;
  jobId: string;
  attempt: number;
  bytes: Uint8Array;
  source: MenuImportSourceType;
  jobInput: Record<string, unknown> & {
    storage_bucket: "intake";
    storage_path: string;
    filename: string;
    mime_type: string;
    parser: "csv" | "xlsx" | "openai";
  };
  admin?: SupabaseClient;
  openai?: OpenAI;
}

export async function runMenuImport({
  organizationId,
  onboardingCaseId,
  menuName,
  jobId,
  attempt,
  bytes,
  source,
  jobInput,
  admin = createAdminClient(),
  openai: providedOpenAI,
}: RunMenuImportInput) {
  if (source.parser === "csv" || source.parser === "xlsx") {
    const staged = await parseTabularMenu({
      filename: jobInput.filename,
      data: bytes,
      menuName,
    });
    const validated = MenuImportStagingSchema.parse(staged);
    const { error } = await admin.rpc("record_menu_import_staging", {
      p_job_id: jobId,
      p_payload: validated,
      p_parser: source.parser,
      p_usage: null,
    });
    if (error) throw new Error(error.message);
    return { status: "review" as const };
  }

  const openai = providedOpenAI ?? createOpenAIClient();
  const previousFileId = typeof jobInput.openai_file_id === "string"
    ? jobInput.openai_file_id
    : null;
  if (previousFileId) {
    try {
      await openai.files.delete(previousFileId);
    } catch {
      // A failed response may already have released its source. Retry must not be
      // blocked by a best-effort cleanup of the previous provider copy.
    }
  }

  const { error: onboardingError } = await admin.from("onboarding_cases").update({
    status: "importing",
    source_file_path: jobInput.storage_path,
  }).eq("id", onboardingCaseId).eq("organization_id", organizationId);
  if (onboardingError) throw new Error(onboardingError.message);

  let uploadedId: string | null = null;
  try {
    const uploaded = await uploadMenuSource({
      data: bytes,
      filename: jobInput.filename,
      mimeType: jobInput.mime_type,
      sourceKind: source.openaiKind ?? "document",
      openai,
    });
    uploadedId = uploaded.id;
    const { data: updatedJob, error: inputUpdateError } = await admin.from("ai_jobs").update({
      input: { ...jobInput, openai_file_id: uploaded.id },
      provider_file_released_at: null,
    }).eq("id", jobId)
      .eq("organization_id", organizationId)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (inputUpdateError || !updatedJob) {
      throw new Error(inputUpdateError?.message ?? "Il job non è più disponibile per l’avvio.");
    }

    const result = await createMenuImportBackgroundJob({
      organizationId,
      onboardingCaseId,
      jobId,
      fileId: uploaded.id,
      filename: jobInput.filename,
      sourceKind: source.openaiKind ?? "document",
      attempts: attempt,
      openai,
      admin,
    });
    if (result.status === "failed") throw new Error("OpenAI non ha accettato l’elaborazione.");
    uploadedId = null;
    return result;
  } catch (error) {
    if (uploadedId) {
      try {
        await openai.files.delete(uploadedId);
      } catch {
        // The primary failure is persisted by the caller with a diagnostic reference.
      }
    }
    throw error;
  }
}
