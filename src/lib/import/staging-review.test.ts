import { describe, expect, it } from "vitest";
import type { MenuImportStaging } from "@/lib/ai/schemas";
import {
  getStagingReviewSummary,
  isActionableIssue,
  normalizeMenuImportStaging,
  prepareReviewedStagingForSave,
} from "@/lib/import/staging-review";

const legacyStaging = {
  menu_name: "Cena",
  source_locale: "it",
  currency: "EUR",
  categories: [{
    name: "Pizze",
    description: null,
    position: 0,
    items: [{
      source_id: null,
      name: "Margherita",
      description: null,
      ingredients: "Impasto, pomodoro, mozzarella",
      price: 9,
      available: null,
      vegetarian: null,
      vegan: null,
      gluten_free: null,
      allergens: [{
        code: "gluten",
        name: "Glutine",
        confidence: { score: 0.9, notes: null },
        issues: [],
      }],
      variants: [{
        name: "Grande",
        price_delta: null,
        available: null,
        allergens: [],
        confidence: { score: 1, notes: null },
        issues: [],
      }],
      confidence: { score: 0.9, notes: null },
      issues: [{
        code: "missing_value",
        severity: "warning",
        path: "categories[0].items[0].allergens",
        message: "Allergeni non dichiarati",
        original_value: null,
      }],
    }],
    confidence: { score: 0.9, notes: null },
    issues: [],
  }],
  confidence: { score: 0.9, notes: null },
  issues: [],
};

describe("operator staging review", () => {
  it("upgrades legacy OpenAI allergens to suggestions requiring a decision", () => {
    const staging = normalizeMenuImportStaging(legacyStaging, "openai");
    expect(staging.categories[0].items[0].allergens[0]).toMatchObject({
      origin: "ai_inferred",
      evidence: null,
      confirmed: null,
    });
    expect(getStagingReviewSummary(staging)).toMatchObject({
      pendingAllergens: 1,
      missingVariantDeltas: 1,
      requiredDecisions: 2,
    });
  });

  it("treats allergens read from deterministic files as confirmed source data", () => {
    const staging = normalizeMenuImportStaging(legacyStaging, "csv");
    expect(staging.categories[0].items[0].allergens[0]).toMatchObject({
      origin: "document",
      confirmed: true,
    });
  });

  it("hides absent optional fields but keeps missing prices actionable", () => {
    const absentAllergens = legacyStaging.categories[0].items[0].issues[0];
    expect(isActionableIssue(absentAllergens as MenuImportStaging["issues"][number])).toBe(false);
    expect(isActionableIssue({
      ...absentAllergens,
      path: "categories[0].items[0].price",
      message: "Prezzo mancante",
    } as MenuImportStaging["issues"][number])).toBe(true);
  });

  it("removes rejected AI suggestions but records the operator decision", () => {
    const staging = normalizeMenuImportStaging(legacyStaging, "openai");
    staging.categories[0].items[0].allergens[0].confirmed = false;
    const reviewed = prepareReviewedStagingForSave(staging);
    expect(reviewed.categories[0].items[0].allergens).toEqual([]);
    expect(reviewed.categories[0].items[0].issues).toContainEqual(
      expect.objectContaining({
        severity: "info",
        message: expect.stringContaining("rifiutato dall'operatore"),
      }),
    );
  });
});
