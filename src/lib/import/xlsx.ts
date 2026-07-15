import ExcelJS from "exceljs";
import {
  normalizeHeader,
  rowsToMenuStaging,
  type RowsToStagingOptions,
  type TabularRow,
} from "@/lib/import/tabular";

function cellText(value: ExcelJS.CellValue) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("result" in value) return String(value.result ?? "");
    if ("text" in value) return String(value.text ?? "");
    if ("richText" in value) {
      return value.richText.map((part) => part.text).join("");
    }
  }
  return String(value);
}

export async function parseXlsxMenu(
  input: Uint8Array | ArrayBuffer,
  options: RowsToStagingOptions = {},
) {
  const workbook = new ExcelJS.Workbook();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  await workbook.xlsx.load(arrayBuffer);

  const worksheet = workbook.worksheets.find((sheet) => sheet.actualRowCount > 0);
  if (!worksheet) return rowsToMenuStaging([], options);

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  for (let column = 1; column <= headerRow.cellCount; column += 1) {
    headers[column] = normalizeHeader(cellText(headerRow.getCell(column).value));
  }

  const rows: TabularRow[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const record: TabularRow = {};
    let hasValue = false;
    for (let column = 1; column < headers.length; column += 1) {
      const header = headers[column];
      if (!header) continue;
      const value = cellText(row.getCell(column).value).trim();
      if (value) hasValue = true;
      record[header] = value;
    }
    if (hasValue) rows.push(record);
  }

  return rowsToMenuStaging(rows, options);
}
