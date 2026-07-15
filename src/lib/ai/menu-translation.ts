import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { createOpenAIClient } from "@/lib/ai/client";
import { getAiModelSettings } from "@/lib/ai/config";
import { TranslationDraftsSchema } from "@/lib/ai/schemas";

export const MENU_TRANSLATION_PROMPT_VERSION = "menu-translation-v1";

const TranslationRequestSchema = z.object({
  source_locale: z.literal("it"),
  target_locale: z.enum(["en", "fr", "de", "es"]),
  entries: z.array(
    z.object({
      key: z.string().min(1),
      source_text: z.string().min(1),
      context: z.string().nullable(),
    }),
  ),
});

export type TranslationRequest = z.infer<typeof TranslationRequestSchema>;

export interface CreateTranslationDraftsOptions {
  openai?: OpenAI;
}

export async function createTranslationDrafts(
  request: TranslationRequest,
  options: CreateTranslationDraftsOptions = {},
) {
  const input = TranslationRequestSchema.parse(request);
  const settings = getAiModelSettings("translation");
  const openai = options.openai ?? createOpenAIClient();

  let response;
  try {
    response = await openai.responses.parse({
      model: settings.model,
      reasoning: { effort: settings.reasoningEffort },
      instructions:
        "Traduci testi di menu dall'italiano mantenendo tono, significato gastronomico, nomi propri e allergeni. Non inventare dettagli. Restituisci una voce per ogni key e segnala le ambiguità.",
      input: JSON.stringify(input),
      text: {
        format: zodTextFormat(TranslationDraftsSchema, "menu_translation_drafts"),
      },
      metadata: { prompt_version: MENU_TRANSLATION_PROMPT_VERSION },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "errore sconosciuto";
    throw new Error(`Traduzione OpenAI non riuscita: ${message}`);
  }

  if (!response.output_parsed) {
    throw new Error(
      "OpenAI non ha restituito una traduzione strutturata; nessuna traduzione è stata salvata.",
    );
  }

  const parsed = TranslationDraftsSchema.parse(response.output_parsed);
  if (
    parsed.source_locale !== input.source_locale ||
    parsed.target_locale !== input.target_locale
  ) {
    throw new Error(
      "OpenAI ha restituito le traduzioni per una lingua diversa da quella richiesta; nessuna traduzione è stata salvata.",
    );
  }
  const requestedKeys = new Set(input.entries.map((entry) => entry.key));
  const returnedKeys = new Set(parsed.translations.map((entry) => entry.key));
  if (
    requestedKeys.size !== input.entries.length ||
    parsed.translations.length !== input.entries.length ||
    returnedKeys.size !== requestedKeys.size ||
    [...requestedKeys].some((key) => !returnedKeys.has(key))
  ) {
    throw new Error(
      "OpenAI ha restituito un insieme incompleto o duplicato di traduzioni; nessuna traduzione è stata salvata.",
    );
  }

  return {
    drafts: parsed,
    responseId: response.id,
    usage: response.usage,
    model: settings.model,
  };
}
