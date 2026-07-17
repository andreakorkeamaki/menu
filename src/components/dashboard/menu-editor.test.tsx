import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MenuEditor, filterMenuEditorItems } from "./menu-editor";

vi.mock("@/app/dashboard/actions", () => ({
  createCategory: "/category/create",
  createMenuItem: "/item/create",
  deleteCategory: "/category/delete",
  deleteMenuItem: "/item/delete",
  deleteMenuItemMedia: "/item/media/delete",
  moveMenuItem: "/item/move",
  removeMenuItemImage: "/item/media/remove-current",
  renameCategory: "/category/rename",
  reorderMenuEntity: "/menu/reorder",
  saveMenuItem: "/item/save",
  uploadMenuItemMedia: "/item/media/upload",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("MenuEditor", () => {
  it("exposes complete, explicit draft structure controls", () => {
    const html = renderToStaticMarkup(
      <MenuEditor
        menu={{ id: "menu-1", name: "Menu" }}
        categories={[
          { id: "category-1", name_it: "Antipasti", slug: "antipasti", sort_order: 0 },
          { id: "category-2", name_it: "Primi", slug: "primi", sort_order: 1 },
        ]}
        items={[
          { id: "item-1", category_id: "category-1", name_it: "Crostini", description_it: "Pane tostato", ingredients_it: "Pane", price: 8, available: true, vegetarian: true, vegan: false, gluten_free: false, image_url: null, sort_order: 0 },
        ]}
        allergens={[]}
        itemAllergens={[]}
      />,
    );

    expect(html).toContain("Rinomina e ordina le sezioni");
    expect(html).toContain('name="target_category_id"');
    expect(html).toContain("Sposta categoria dopo");
    expect(html).toContain("Rimuovi piatto");
    expect(html).toContain("La versione online resterà invariata");
    expect(html).toContain("Questa categoria è vuota");
    expect(html).toContain("La galleria è separata dall’editor");
    expect(html).toContain('href="/dashboard/photos"');
    expect(html).not.toContain("Invia per la revisione");
    expect(html).not.toContain("Studio immagini AI");
  });

  it("shows only available items missing a description in the focused editor", () => {
    const html = renderToStaticMarkup(
      <MenuEditor
        menu={{ id: "menu-1", name: "Menu" }}
        categories={[{ id: "category-1", name_it: "Antipasti", slug: "antipasti", sort_order: 0 }]}
        items={[
          { id: "missing", category_id: "category-1", name_it: "Crostini", description_it: null, ingredients_it: "Pane", price: 8, available: true, vegetarian: true, vegan: false, gluten_free: false, image_url: null, sort_order: 0 },
          { id: "complete", category_id: "category-1", name_it: "Bruschetta", description_it: "Pane e pomodoro", ingredients_it: "Pane, pomodoro", price: 9, available: true, vegetarian: true, vegan: true, gluten_free: false, image_url: null, sort_order: 1 },
          { id: "offline", category_id: "category-1", name_it: "Focaccia", description_it: null, ingredients_it: "Farina", price: 7, available: false, vegetarian: true, vegan: true, gluten_free: false, image_url: null, sort_order: 2 },
        ]}
        allergens={[]}
        itemAllergens={[]}
        focus="descriptions"
      />,
    );

    expect(html).toContain("Descrizioni da completare");
    expect(html).toContain("Crostini");
    expect(html).not.toContain("Bruschetta");
    expect(html).not.toContain("Focaccia");
    expect(html).toContain('name="focus" value="descriptions"');
    expect(html).not.toContain("Rinomina e ordina le sezioni");
  });

  it("filters food-information checks by ingredients and declared allergens", () => {
    const items = [
      { id: "missing", category_id: "category-1", name_it: "Crostini", description_it: "Pane tostato", ingredients_it: null, price: 8, available: true, vegetarian: true, vegan: false, gluten_free: false, image_url: null, sort_order: 0 },
      { id: "ingredients", category_id: "category-1", name_it: "Focaccia", description_it: "Focaccia calda", ingredients_it: "Farina", price: 7, available: true, vegetarian: true, vegan: true, gluten_free: false, image_url: null, sort_order: 1 },
      { id: "allergen", category_id: "category-1", name_it: "Tagliere", description_it: "Selezione", ingredients_it: null, price: 14, available: true, vegetarian: false, vegan: false, gluten_free: false, image_url: null, sort_order: 2 },
    ];

    expect(filterMenuEditorItems(items, [{ item_id: "allergen", allergen_id: "gluten" }], "food-info").map((item) => item.id)).toEqual(["missing"]);
  });
});
