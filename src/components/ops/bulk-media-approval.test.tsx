import { describe, expect, it } from "vitest";
import { bulkApprovalSummary } from "@/components/ops/bulk-media-approval";

describe("bulkApprovalSummary", () => {
  it("keeps successful approvals when other assets fail", () => {
    expect(bulkApprovalSummary({
      a: { status: "approved" },
      b: { status: "failed", error: "stale" },
      c: { status: "running" },
    })).toEqual({ approved: 1, failed: 1, completed: 2 });
  });
});
