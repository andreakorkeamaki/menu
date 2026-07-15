import { createOpenAIClient } from "@/lib/ai/client";
import { requireOpenAIWebhookSecret } from "@/lib/ai/config";
import {
  createSupabaseWebhookRepository,
  isResponseWebhookEvent,
  processResponseWebhook,
} from "@/lib/ai/webhook";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  let openai;
  let webhookSecret;
  try {
    openai = createOpenAIClient();
    webhookSecret = requireOpenAIWebhookSecret();
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "OpenAI non configurato." },
      503,
    );
  }

  const rawBody = await request.text();
  let event: unknown;
  try {
    event = await openai.webhooks.unwrap(rawBody, request.headers, webhookSecret);
  } catch {
    return json({ error: "Firma webhook OpenAI non valida." }, 400);
  }

  const webhookId = request.headers.get("webhook-id");
  if (!webhookId) return json({ error: "Header webhook-id mancante." }, 400);

  if (!isResponseWebhookEvent(event)) {
    return json({ received: true, ignored: true });
  }

  try {
    const result = await processResponseWebhook({
      webhookId,
      event,
      rawPayload: JSON.parse(rawBody),
      openai,
      repository: createSupabaseWebhookRepository(createAdminClient()),
    });
    return json({ received: true, ...result });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Elaborazione webhook OpenAI non riuscita.",
      },
      500,
    );
  }
}
