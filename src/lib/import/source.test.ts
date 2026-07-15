import { describe, expect, it } from "vitest";
import { classifyMenuImportSource } from "@/lib/import/source";

describe("menu intake source classification", () => {
  it.each([
    ["menu.csv", "csv", null],
    ["MENU.XLSX", "xlsx", null],
    ["menu.pdf", "openai", "document"],
    ["menu.docx", "openai", "document"],
    ["scan.jpeg", "openai", "image"],
    ["scan.webp", "openai", "image"],
  ] as const)("routes %s to %s", (filename, parser, openaiKind) => {
    expect(classifyMenuImportSource(filename)).toMatchObject({ parser, openaiKind });
  });

  it("rejects file types outside the explicit intake allowlist", () => {
    expect(classifyMenuImportSource("menu.exe")).toBeNull();
    expect(classifyMenuImportSource("menu")).toBeNull();
  });
});
