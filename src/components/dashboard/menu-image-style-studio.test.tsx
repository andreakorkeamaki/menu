import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  MenuImageStyleStudio,
  menuImageStylePayload,
  menuImageStyleSummary,
  selectMenuImageStyleSamples,
  type MenuImageStyleItem,
} from "@/components/dashboard/menu-image-style-studio";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const items: MenuImageStyleItem[] = [
  { id: "a1", name: "A uno", categoryId: "a", categoryName: "Antipasti", replaceAssetId: "asset-a" },
  { id: "a2", name: "A due", categoryId: "a", categoryName: "Antipasti" },
  { id: "b1", name: "B uno", categoryId: "b", categoryName: "Primi" },
  { id: "c1", name: "C uno", categoryId: "c", categoryName: "Dessert" },
  { id: "d1", name: "D uno", categoryId: "d", categoryName: "Cocktail" },
  { id: "e1", name: "E uno", categoryId: "e", categoryName: "Vini" },
];

describe("MenuImageStyleStudio", () => {
  it("selects one representative per category up to four", () => {
    expect(selectMenuImageStyleSamples(items).map((item) => item.id)).toEqual(["a1", "b1", "c1", "d1"]);
  });

  it("builds a trimmed regeneration payload and honors a fresh replacement", () => {
    expect(menuImageStylePayload({
      item: items[0],
      instructions: "  luce naturale  ",
      replacementOverride: "asset-new",
      generationContext: "style_sample",
      batchId: "00000000-0000-4000-8000-000000000099",
    })).toEqual({
      item_id: "a1",
      instructions: "luce naturale",
      replace_asset_id: "asset-new",
      generation_context: "style_sample",
      batch_id: "00000000-0000-4000-8000-000000000099",
    });
  });

  it("counts partial results and reused style samples", () => {
    expect(menuImageStyleSummary({
      a: { status: "saved" },
      b: { status: "reused" },
      c: { status: "failed", error: "provider" },
      d: { status: "running" },
    })).toEqual({ completed: 3, saved: 1, reused: 1, failed: 1 });
  });

  it("renders style presets, category samples and both safe batch actions", () => {
    const html = renderToStaticMarkup(<MenuImageStyleStudio items={items} />);
    expect(html).toContain("Trova l’atmosfera giusta prima di rifare tutto");
    expect(html).toContain("Editoriale chiaro");
    expect(html).toContain("Genera 4 prove");
    expect(html).toContain("Rigenera tutto il catalogo (6)");
    expect(html).toContain("Antipasti");
    expect(html).not.toContain("E uno");
  });
});
