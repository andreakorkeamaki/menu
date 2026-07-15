import { afterEach, describe, expect, it } from "vitest";
import { getAiModelSettings, requireOpenAIApiKey } from "@/lib/ai/config";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("AI model configuration", () => {
  it("uses independent standard models for import and translation", () => {
    process.env.OPENAI_IMPORT_MODEL = "import-model";
    process.env.OPENAI_TRANSLATION_MODEL = "translation-model";

    expect(getAiModelSettings("import").model).toBe("import-model");
    expect(getAiModelSettings("translation").model).toBe("translation-model");
  });

  it("uses Terra for imports and Luna with xhigh reasoning for translations", () => {
    delete process.env.OPENAI_IMPORT_MODEL;
    delete process.env.OPENAI_TRANSLATION_MODEL;
    expect(getAiModelSettings("import")).toEqual({
      model: "gpt-5.6-terra",
      reasoningEffort: "high",
    });
    expect(getAiModelSettings("translation")).toEqual({
      model: "gpt-5.6-luna",
      reasoningEffort: "xhigh",
    });
  });

  it("fails with an operational message when the server key is absent", () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => requireOpenAIApiKey()).toThrow("OPENAI_API_KEY");
  });
});
