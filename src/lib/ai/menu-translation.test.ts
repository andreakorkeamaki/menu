import type OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTranslationDrafts } from "@/lib/ai/menu-translation";

const originalModel = process.env.OPENAI_TRANSLATION_MODEL;

afterEach(() => {
  if (originalModel === undefined) delete process.env.OPENAI_TRANSLATION_MODEL;
  else process.env.OPENAI_TRANSLATION_MODEL = originalModel;
});

describe("createTranslationDrafts", () => {
  it("always sends translation work to Luna with xhigh reasoning", async () => {
    delete process.env.OPENAI_TRANSLATION_MODEL;
    const parse = vi.fn(async () => ({
      id: "resp-1",
      usage: { total_tokens: 12 },
      output_parsed: {
        source_locale: "it",
        target_locale: "en",
        translations: [
          {
            key: "row-1",
            translated_text: "Starter",
            confidence: { score: 1, notes: null },
            issues: [],
          },
        ],
        issues: [],
      },
    }));
    const openai = { responses: { parse } } as unknown as OpenAI;

    await createTranslationDrafts(
      {
        source_locale: "it",
        target_locale: "en",
        entries: [{ key: "row-1", source_text: "Antipasto", context: null }],
      },
      { openai },
    );

    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.6-luna",
        reasoning: { effort: "xhigh" },
      }),
    );
  });
});
