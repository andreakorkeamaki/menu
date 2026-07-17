export type AiTask = "import" | "translation";

export interface AiModelSettings {
  model: string;
  reasoningEffort: "high" | "xhigh";
}

const DEFAULT_MODELS: Record<AiTask, string> = {
  import: "gpt-5.6-terra",
  translation: "gpt-5.6-luna",
};

const DEFAULT_IMAGE_MODEL = "gpt-image-2";

function nonEmptyEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function getAiModelSettings(task: AiTask): AiModelSettings {
  const envName =
    task === "import" ? "OPENAI_IMPORT_MODEL" : "OPENAI_TRANSLATION_MODEL";

  return {
    model: nonEmptyEnv(envName) ?? DEFAULT_MODELS[task],
    reasoningEffort: task === "translation" ? "xhigh" : "high",
  };
}

export function getImageModel() {
  return nonEmptyEnv("OPENAI_IMAGE_MODEL") ?? DEFAULT_IMAGE_MODEL;
}

export function requireOpenAIApiKey() {
  const apiKey = nonEmptyEnv("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error(
      "OpenAI non configurato: imposta OPENAI_API_KEY solo nell'ambiente server.",
    );
  }
  return apiKey;
}

export function requireOpenAIWebhookSecret() {
  const secret = nonEmptyEnv("OPENAI_WEBHOOK_SECRET");
  if (!secret) {
    throw new Error(
      "Webhook OpenAI non configurato: imposta OPENAI_WEBHOOK_SECRET nell'ambiente server.",
    );
  }
  return secret;
}
