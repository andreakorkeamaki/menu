import { parseCsvMenu } from "@/lib/import/csv";
import { parseXlsxMenu } from "@/lib/import/xlsx";

export interface ParseTabularMenuInput {
  filename: string;
  data: string | Uint8Array | ArrayBuffer;
  menuName?: string;
}

export async function parseTabularMenu({
  filename,
  data,
  menuName,
}: ParseTabularMenuInput) {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension === "csv") {
    if (data instanceof ArrayBuffer) {
      return parseCsvMenu(new Uint8Array(data), { menuName });
    }
    return parseCsvMenu(data, { menuName });
  }
  if (extension === "xlsx") {
    if (typeof data === "string") {
      throw new Error("Il contenuto XLSX deve essere fornito come dati binari.");
    }
    return parseXlsxMenu(data, { menuName });
  }

  throw new Error(
    `Formato tabellare non supportato per '${filename}'. Usa CSV o XLSX; PDF e immagini devono passare dall'importazione AI.`,
  );
}
