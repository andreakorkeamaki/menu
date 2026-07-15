import OpenAI from "openai";
import { requireOpenAIApiKey } from "@/lib/ai/config";

function assertServerRuntime() {
  if (typeof window !== "undefined") {
    throw new Error("Le chiamate OpenAI sono consentite solo lato server.");
  }
}

export function createOpenAIClient() {
  assertServerRuntime();
  return new OpenAI({ apiKey: requireOpenAIApiKey() });
}
