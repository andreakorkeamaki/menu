import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseXlsxMenu } from "@/lib/import/xlsx";

describe("parseXlsxMenu", () => {
  it("reads the first non-empty worksheet into validated staging", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Menu");
    sheet.addRow(["Categoria", "Nome", "Prezzo", "Vegano"]);
    sheet.addRow(["Dolci", "Sorbetto", 6, "sì"]);
    const buffer = await workbook.xlsx.writeBuffer();

    const staged = await parseXlsxMenu(new Uint8Array(buffer as ArrayBuffer), {
      menuName: "Dessert",
    });
    expect(staged.menu_name).toBe("Dessert");
    expect(staged.categories[0].items[0]).toMatchObject({
      name: "Sorbetto",
      price: 6,
      vegan: true,
    });
  });
});
