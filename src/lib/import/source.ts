export type MenuImportParser = "csv" | "xlsx" | "openai";
export type OpenAISourceKind = "document" | "image";

export interface MenuImportSourceType {
  extension: string;
  mimeType: string;
  parser: MenuImportParser;
  openaiKind: OpenAISourceKind | null;
}

const SOURCE_TYPES: Record<string, Omit<MenuImportSourceType, "extension">> = {
  csv: { mimeType: "text/csv", parser: "csv", openaiKind: null },
  xlsx: {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    parser: "xlsx",
    openaiKind: null,
  },
  pdf: { mimeType: "application/pdf", parser: "openai", openaiKind: "document" },
  doc: { mimeType: "application/msword", parser: "openai", openaiKind: "document" },
  docx: {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    parser: "openai",
    openaiKind: "document",
  },
  jpg: { mimeType: "image/jpeg", parser: "openai", openaiKind: "image" },
  jpeg: { mimeType: "image/jpeg", parser: "openai", openaiKind: "image" },
  png: { mimeType: "image/png", parser: "openai", openaiKind: "image" },
  webp: { mimeType: "image/webp", parser: "openai", openaiKind: "image" },
};

export function classifyMenuImportSource(filename: string) {
  const extension = filename.split(".").pop()?.toLocaleLowerCase("en-US") ?? "";
  const source = SOURCE_TYPES[extension];
  if (!source) return null;
  return {
    ...source,
    extension,
    // The extension selects the allowlisted canonical MIME type. Browser-provided MIME values are
    // advisory and are deliberately not trusted for choosing an OpenAI input mode.
    mimeType: source.mimeType,
  } satisfies MenuImportSourceType;
}
