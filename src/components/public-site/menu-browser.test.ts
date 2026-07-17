import { describe, expect, it } from "vitest";
import { DEMO_SNAPSHOT } from "@/lib/demo-data";
import { filterMenuCategories } from "./menu-browser";

function itemNames(categories: ReturnType<typeof filterMenuCategories>) {
  return categories.flatMap((category) => category.items.map((item) => item.name.it));
}

describe("filterMenuCategories", () => {
  const categories = DEMO_SNAPSHOT.menu.categories;

  it("filters by an explicit dietary claim", () => {
    const result = filterMenuCategories({
      categories,
      locale: "it",
      query: "",
      dietaryFilter: "gluten_free",
      excludedAllergen: "",
    });

    expect(itemNames(result)).toEqual(["Uovo, patata e tartufo"]);
  });

  it("combines search, dietary filters and allergen exclusion", () => {
    const result = filterMenuCategories({
      categories,
      locale: "en",
      query: "egg",
      dietaryFilter: "vegetarian",
      excludedAllergen: "Milk",
    });

    expect(itemNames(result)).toEqual([]);
  });

  it("matches translated allergen names in localized search", () => {
    const result = filterMenuCategories({
      categories,
      locale: "en",
      query: "celery",
      dietaryFilter: null,
      excludedAllergen: "",
    });

    expect(itemNames(result)).toEqual(["Tagliatelle al ragù"]);
  });
});
