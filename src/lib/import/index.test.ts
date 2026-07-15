import { describe, expect, it } from "vitest";
import { parseTabularMenu } from "@/lib/import";

describe("parseTabularMenu", () => {
  it("routes CSV input to deterministic staging", async () => {
    const staged = await parseTabularMenu({
      filename: "menu.csv",
      data: "Categoria,Nome,Prezzo\nPizza,Margherita,9",
    });
    expect(staged.categories[0].items[0].name).toBe("Margherita");
  });

  it("rejects formats that must use the reviewed AI workflow", async () => {
    await expect(
      parseTabularMenu({ filename: "menu.pdf", data: new Uint8Array() }),
    ).rejects.toThrow("importazione AI");
  });
});
