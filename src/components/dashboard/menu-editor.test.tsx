import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MenuEditor } from "./menu-editor";

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
    expect(html).toContain("Foto del piatto");
    expect(html).toContain("Invia per la revisione");
  });
});
