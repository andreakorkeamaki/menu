import { describe, expect, it } from "vitest";
import {
  maximumTranslationRequests,
  TRANSLATION_BATCH_LIMIT,
} from "@/lib/ai/translation-limits";

describe("translation generation limits", () => {
  it("plans enough requests to generate queues larger than one API batch", () => {
    expect(TRANSLATION_BATCH_LIMIT).toBe(200);
    expect(maximumTranslationRequests(520)).toBe(3);
  });

  it("keeps a single-row regeneration to one request", () => {
    expect(maximumTranslationRequests(520, true)).toBe(1);
    expect(maximumTranslationRequests(0)).toBe(1);
  });
});
