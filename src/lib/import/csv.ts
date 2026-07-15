import Papa from "papaparse";
import {
  normalizeHeader,
  rowsToMenuStaging,
  sourceParseIssue,
  type RowsToStagingOptions,
  type TabularRow,
} from "@/lib/import/tabular";

export function parseCsvMenu(
  input: string | Uint8Array,
  options: RowsToStagingOptions = {},
) {
  const csv = typeof input === "string" ? input : new TextDecoder().decode(input);
  const result = Papa.parse<TabularRow>(csv.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: normalizeHeader,
  });

  const sourceIssues = [
    ...(options.sourceIssues ?? []),
    ...result.errors.map((error) =>
      sourceParseIssue(
        `CSV riga ${error.row === undefined ? "?" : error.row + 1}: ${error.message}`,
        error.code,
      ),
    ),
  ];

  return rowsToMenuStaging(result.data, { ...options, sourceIssues });
}
