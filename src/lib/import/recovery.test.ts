import { describe, expect, it } from "vitest";
import {
  ImportRetryClaimSchema,
  isImportStalled,
  stalledImportCutoff,
  validatedRetrySource,
} from "@/lib/import/recovery";

const claim = {
  job_id: "00000000-0000-4000-8000-000000000001",
  organization_id: "00000000-0000-4000-8000-000000000002",
  onboarding_case_id: "00000000-0000-4000-8000-000000000003",
  menu_id: "00000000-0000-4000-8000-000000000004",
  attempt: 2,
  source_path: "org/case/menu.pdf",
  source: {
    storage_bucket: "intake" as const,
    filename: "menu.pdf",
    mime_type: "application/pdf",
    parser: "openai" as const,
    size_bytes: 1024,
  },
};

describe("import recovery", () => {
  it("accepts a private source whose canonical type still matches", () => {
    const parsed = ImportRetryClaimSchema.parse(claim);
    expect(validatedRetrySource(parsed)).toMatchObject({ parser: "openai", openaiKind: "document" });
  });

  it("rejects tampered or inconsistent source metadata", () => {
    const parsed = ImportRetryClaimSchema.parse({
      ...claim,
      source: { ...claim.source, parser: "csv" },
    });
    expect(() => validatedRetrySource(parsed)).toThrow("non corrispondono");
  });

  it("flags only active jobs that have stopped updating for fifteen minutes", () => {
    const now = Date.parse("2026-07-17T12:30:00Z");
    expect(isImportStalled("running", "2026-07-17T12:00:00Z", now)).toBe(true);
    expect(isImportStalled("queued", "2026-07-17T12:25:00Z", now)).toBe(false);
    expect(isImportStalled("failed", "2026-07-17T10:00:00Z", now)).toBe(false);
    expect(stalledImportCutoff(now)).toBe("2026-07-17T12:15:00.000Z");
  });
});
