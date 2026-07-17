import { describe, expect, it } from "vitest";
import { mediaReviewHref, parseMediaReviewContext, parseMediaReviewPage } from "@/lib/media-review-pagination";

describe("media review pagination", () => {
  it("accepts only positive, unambiguous pages", () => {
    expect(parseMediaReviewPage("12")).toBe(12);
    expect(parseMediaReviewPage("12x")).toBe(1);
    expect(parseMediaReviewPage("0")).toBe(1);
  });

  it("accepts only an explicit organization and menu context", () => {
    const organizationId = "00000000-0000-4000-8000-000000000001";
    const menuId = "00000000-0000-4000-8000-000000000002";
    expect(parseMediaReviewContext(`${organizationId}:${menuId}`)).toEqual({
      organizationId,
      menuId,
      value: `${organizationId}:${menuId}`,
    });
    expect(parseMediaReviewContext(`${organizationId}:not-a-menu`)).toBeNull();
    expect(mediaReviewHref(2, { context: `${organizationId}:${menuId}` }))
      .toContain("context=");
  });

  it("preserves action feedback without adding a noisy first-page parameter", () => {
    expect(mediaReviewHref(1, { reviewed: "approved" })).toBe("/ops/media?reviewed=approved");
    expect(mediaReviewHref(3, { error: "source" })).toBe("/ops/media?page=3&error=source");
  });
});
