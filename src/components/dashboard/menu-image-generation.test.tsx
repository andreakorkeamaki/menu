import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  MenuImageGeneration,
  menuImageProgressCopy,
} from "@/components/dashboard/menu-image-generation";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("MenuImageGeneration", () => {
  it("shows one action with truthful catalog indicators", () => {
    const html = renderToStaticMarkup(<MenuImageGeneration items={[
      { id: "item-1", name: "Tortelloni", hasImage: true, mediaStatus: "approved" },
      { id: "item-2", name: "Crescentine", hasImage: false, mediaStatus: "draft" },
      { id: "item-3", name: "Zuppa inglese", hasImage: false, mediaStatus: "rejected" },
    ]} />);

    expect(html).toContain("Completa le foto del catalogo");
    expect(html).toContain("Qualità media · WebP");
    expect(html).toContain("Genera 1 immagine mancante");
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain("In revisione");
  });

  it("rotates useful status copy while keeping the current dish visible", () => {
    const early = menuImageProgressCopy(1, [], 0, 10);
    const first = menuImageProgressCopy(8, ["Tortelloni"], 2, 10);
    const later = menuImageProgressCopy(16, ["Tortelloni"], 2, 10);
    expect(early).toContain("Preparo");
    expect(first).toContain("Tortelloni");
    expect(later).toContain("Tortelloni");
    expect(later).not.toBe(first);
  });
});
