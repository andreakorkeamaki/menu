import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { leadListHref, parseLeadPage } from "@/lib/lead-list";

describe("lead pipeline list", () => {
  it("normalizes forged pages", () => {
    expect(parseLeadPage("3")).toBe(3);
    expect(parseLeadPage("3x")).toBe(1);
    expect(parseLeadPage("-2")).toBe(1);
  });

  it("preserves filter context after a status update", () => {
    expect(leadListHref({ status: "qualified", page: 2, updated: true }))
      .toBe("/ops/leads?status=qualified&page=2&updated=1");
    expect(leadListHref({ status: null, page: 1 })).toBe("/ops/leads");
  });

  it("uses database filters and ranges rather than a sampled in-memory list", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/ops/leads/page.tsx"), "utf8");

    expect(source).toContain(".range(rangeStart, rangeStart + LEAD_PAGE_SIZE - 1)");
    expect(source).toContain('requestQuery = requestQuery.eq("status", selectedStatus)');
    expect(source).not.toContain(".limit(250)");
    expect(source).not.toContain("requests.filter((request) => request.status === status).length");
  });
});
