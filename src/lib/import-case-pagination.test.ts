import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importWorkspaceHref, parseImportCasePage } from "@/lib/import-case-pagination";

describe("import case navigation", () => {
  it("rejects malformed pages instead of partially parsing them", () => {
    expect(parseImportCasePage("4")).toBe(4);
    expect(parseImportCasePage("4x")).toBe(1);
    expect(parseImportCasePage("-2")).toBe(1);
  });

  it("keeps direct case links stable while omitting the default page", () => {
    expect(importWorkspaceHref({ caseId: "case-1", page: 1 })).toBe("/ops/import?case=case-1");
    expect(importWorkspaceHref({ caseId: "case-1", page: 3 })).toBe("/ops/import?case=case-1&page=3");
    expect(importWorkspaceHref({ page: 2, error: "case-missing" })).toBe("/ops/import?page=2&error=case-missing");
  });

  it("loads jobs and staging from the selected case instead of capped global lists", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/ops/import/page.tsx"), "utf8");

    expect(source.match(/\.eq\("onboarding_case_id", selectedCaseId\)/g)).toHaveLength(2);
    expect(source).toContain(".range(caseRangeStart, caseRangeStart + IMPORT_CASE_PAGE_SIZE - 1)");
    expect(source).not.toContain(".limit(50)");
    expect(source).not.toContain(".limit(100)");
  });
});
