import { describe, expect, it } from "vitest";
import { buildDraftMenuPreview, type DraftMenuPreviewInput } from "@/lib/draft-menu-preview";

const baseInput: DraftMenuPreviewInput = {
  organizationId: "org-1",
  menu: { id: "menu-1", name: "Cena", currency: "EUR", source_locale: "it", active_locales: ["it", "en"], updated_at: "2026-07-17T00:00:00.000Z" },
  location: { id: "location-1", slug: "osteria", name: "Osteria", tagline_it: "A tavola", description_it: "Cucina sincera", city: "Bologna", address: "Via Test 1", phone: "+39 000", opening_hours: [{ days: "Lun–Dom", hours: "12:00–22:00" }] },
  theme: { theme_key: "minimal", background: "#ffffff", surface: "#f8f8f8", text: "#111111", muted: "#666666", accent: "#aa2200", accent_text: "#ffffff", heading_font: "serif", body_font: "sans", radius: "1rem" },
  categories: [
    { id: "category-2", slug: "dolci", name_it: "Dolci", sort_order: 2 },
    { id: "category-1", slug: "primi", name_it: "Primi", description_it: "Pasta fresca", sort_order: 1 },
  ],
  items: [
    { id: "item-1", category_id: "category-1", name_it: "Tagliatelle", description_it: "Ragù", ingredients_it: "Pasta, carne", price: "16", available: true, vegetarian: false, vegan: false, gluten_free: false, sort_order: 0 },
  ],
  variants: [
    { id: "variant-hidden", item_id: "item-1", name_it: "Nascosta", price_delta: 1, available: false, sort_order: 0 },
    { id: "variant-1", item_id: "item-1", name_it: "Grande", price_delta: "3", available: true, sort_order: 1 },
  ],
  allergens: [{ id: "allergen-1", name_it: "Glutine" }],
  itemAllergens: [{ item_id: "item-1", allergen_id: "allergen-1" }],
  translations: [
    { entity_type: "location", entity_id: "location-1", field_name: "tagline", locale: "en", translated_text: "Come to the table", status: "approved" },
    { entity_type: "category", entity_id: "category-1", field_name: "name", locale: "en", translated_text: "First courses", status: "approved" },
    { entity_type: "item", entity_id: "item-1", field_name: "name", locale: "en", translated_text: "Stale pasta", status: "stale" },
    { entity_type: "variant", entity_id: "variant-1", field_name: "name", locale: "en", translated_text: "Large", status: "approved" },
  ],
};

describe("draft menu preview", () => {
  it("builds the real themed menu shape without persisting a publication", () => {
    const snapshot = buildDraftMenuPreview(baseInput);

    expect(snapshot.location.tagline.en).toBe("Come to the table");
    expect(snapshot.theme.key).toBe("minimal");
    expect(snapshot.menu.categories.map((category) => category.slug)).toEqual(["primi", "dolci"]);
    expect(snapshot.menu.categories[0].items[0]).toMatchObject({
      price: 16,
      allergens: ["Glutine"],
      name: { it: "Tagliatelle" },
      variants: [{ id: "variant-1", name: { it: "Grande", en: "Large" }, price_delta: 3 }],
    });
    expect(snapshot.menu.categories[0].items[0].name.en).toBeUndefined();
    expect(snapshot.published_at).toBe("2026-07-17T00:00:00.000Z");
  });

  it("always keeps Italian available and ignores unsupported locales", () => {
    const snapshot = buildDraftMenuPreview({
      ...baseInput,
      menu: { ...baseInput.menu, active_locales: ["en", "xx"] },
    });

    expect(snapshot.menu.active_locales).toEqual(["it", "en"]);
  });
});
