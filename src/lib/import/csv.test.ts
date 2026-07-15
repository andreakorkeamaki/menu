import { describe, expect, it } from "vitest";
import { parseCsvMenu } from "@/lib/import/csv";

describe("parseCsvMenu", () => {
  it("deterministically stages Italian menu rows", () => {
    const csv = [
      "Categoria;Nome;Descrizione;Prezzo;Disponibile;Allergeni;Varianti;Supplemento variante",
      'Antipasti;Bruschetta;Pane e pomodoro;"8,50";sì;Glutine;Normale|Grande;0|3',
      'Primi;Risotto;Risotto ai funghi;"14,00";no;Latte;;',
    ].join("\n");

    const staged = parseCsvMenu(csv, { menuName: "Cena" });
    expect(staged.menu_name).toBe("Cena");
    expect(staged.categories).toHaveLength(2);
    expect(staged.categories[0].items[0]).toMatchObject({
      name: "Bruschetta",
      price: 8.5,
      available: true,
      allergens: [{ code: "gluten", origin: "document", confirmed: true, evidence: "Glutine" }],
      variants: [
        { name: "Normale", price_delta: 0 },
        { name: "Grande", price_delta: 3 },
      ],
    });
    expect(staged.categories[1].items[0].available).toBe(false);
  });

  it("keeps invalid values in staging issues instead of publishing them", () => {
    const staged = parseCsvMenu("Categoria;Nome;Prezzo\nDolci;;gratis");
    const item = staged.categories[0].items[0];
    expect(item.price).toBeNull();
    expect(item.issues.map((entry) => entry.code)).toEqual([
      "missing_value",
      "invalid_value",
    ]);
    expect("published" in staged).toBe(false);
  });

  it("keeps duplicate source rows visible and blocking in staging", () => {
    const staged = parseCsvMenu([
      "Categoria;ID;Nome;Prezzo",
      "Primi;dish-1;Risotto;12",
      "Primi;dish-1;Risotto bis;13",
    ].join("\n"));

    expect(staged.categories[0].items).toHaveLength(2);
    expect(staged.categories[0].items[1].issues).toContainEqual(
      expect.objectContaining({
        code: "duplicate_value",
        severity: "error",
        original_value: "dish-1",
      }),
    );
  });
});
