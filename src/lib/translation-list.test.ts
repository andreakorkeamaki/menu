import { describe, expect, it } from "vitest";
import { parseTranslationListParams, translationListHref } from "@/lib/translation-list";

describe("translation review list", () => {
  it("falls back safely from forged filters and invalid pages", () => {
    expect(parseTranslationListParams({ locale: "it", status: "deleted", page: "-3" }))
      .toEqual({ locale: null, status: "attention", page: 1 });
    expect(parseTranslationListParams({ locale: "en", status: "approved", page: "2x" }))
      .toEqual({ locale: "en", status: "approved", page: 1 });
  });

  it("preserves stable filters across pagination without noisy defaults", () => {
    expect(translationListHref({ locale: "de", status: "stale", page: 3 }))
      .toBe("/dashboard/translations?locale=de&status=stale&page=3");
    expect(translationListHref({ locale: null, status: "attention", page: 1 }))
      .toBe("/dashboard/translations");
  });
});
