import { describe, expect, it } from "vitest";
import { buildPublicationReadiness } from "./publication-readiness";

describe("buildPublicationReadiness", () => {
  it("blocks an empty or untranslated menu", () => {
    const result = buildPublicationReadiness({
      categoryCount: 0,
      items: [],
      pendingTranslations: 4,
      locationConfigured: true,
    });

    expect(result.canPublish).toBe(false);
    expect(result.blockers.map((issue) => issue.code)).toEqual(["categories", "items", "translations"]);
  });

  it("warns without blocking when food details need a human check", () => {
    const result = buildPublicationReadiness({
      categoryCount: 1,
      items: [{ available: true, description: "Caffè espresso", ingredients: null, allergenCount: 0 }],
      pendingTranslations: 0,
      locationConfigured: true,
    });

    expect(result.canPublish).toBe(true);
    expect(result.warnings.map((issue) => issue.code)).toEqual(["food-info"]);
  });

  it("ignores unavailable items in public-content warnings", () => {
    const result = buildPublicationReadiness({
      categoryCount: 1,
      items: [
        { available: true, description: "Piatto", ingredients: "Verdure", allergenCount: 0 },
        { available: false, description: null, ingredients: null, allergenCount: 0 },
      ],
      pendingTranslations: 0,
      locationConfigured: true,
    });

    expect(result.canPublish).toBe(true);
    expect(result.warnings).toEqual([]);
  });
});
