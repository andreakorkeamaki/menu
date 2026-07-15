import { describe, expect, it } from "vitest";
import {
  MenuImportStagingSchema,
  validateMenuImportStaging,
} from "@/lib/ai/schemas";

const validStaging = {
  menu_name: "Cena",
  source_locale: "it" as const,
  currency: "EUR" as const,
  categories: [
    {
      name: "Antipasti",
      description: null,
      position: 0,
      items: [
        {
          source_id: null,
          name: "Bruschetta",
          description: null,
          ingredients: "Pane, pomodoro",
          price: 7.5,
          available: true,
          vegetarian: true,
          vegan: null,
          gluten_free: false,
          allergens: [],
          variants: [],
          confidence: { score: 0.95, notes: null },
          issues: [],
        },
      ],
      confidence: { score: 0.95, notes: null },
      issues: [],
    },
  ],
  confidence: { score: 0.95, notes: null },
  issues: [],
};

describe("MenuImportStagingSchema", () => {
  it("validates a reviewable menu staging payload", () => {
    expect(MenuImportStagingSchema.parse(validStaging)).toEqual(validStaging);
  });

  it("rejects impossible confidence and negative prices", () => {
    const invalid = structuredClone(validStaging);
    invalid.confidence.score = 1.2;
    invalid.categories[0].items[0].price = -1;
    expect(MenuImportStagingSchema.safeParse(invalid).success).toBe(false);
    expect(() => validateMenuImportStaging(invalid)).toThrow("Importazione non valida");
  });
});
