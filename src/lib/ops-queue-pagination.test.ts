import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { opsQueueHref, parseOpsQueuePage } from "@/lib/ops-queue-pagination";

describe("operator queue pagination", () => {
  it("normalizes invalid pages", () => {
    expect(parseOpsQueuePage("5")).toBe(5);
    expect(parseOpsQueuePage("5x")).toBe(1);
    expect(parseOpsQueuePage("0")).toBe(1);
  });

  it("keeps the first page canonical", () => {
    expect(opsQueueHref(1)).toBe("/ops");
    expect(opsQueueHref(2)).toBe("/ops?page=2");
  });

  it("uses exact global counts instead of sampled case and job windows", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/ops/page.tsx"), "utf8");

    expect(source).toContain('.neq("status", "published")');
    expect(source).toContain('onboarding_case:onboarding_cases!inner(status)');
    expect(source).toContain('{ count: "exact", head: true }');
    expect(source).not.toContain(".limit(100)");
    expect(source).not.toContain(".limit(200)");
  });
});
