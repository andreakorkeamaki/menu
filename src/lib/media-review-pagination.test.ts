import { describe, expect, it } from "vitest";
import { mediaReviewHref, parseMediaReviewPage } from "@/lib/media-review-pagination";

describe("media review pagination", () => {
  it("accepts only positive, unambiguous pages", () => {
    expect(parseMediaReviewPage("12")).toBe(12);
    expect(parseMediaReviewPage("12x")).toBe(1);
    expect(parseMediaReviewPage("0")).toBe(1);
  });

  it("preserves action feedback without adding a noisy first-page parameter", () => {
    expect(mediaReviewHref(1, { reviewed: "approved" })).toBe("/ops/media?reviewed=approved");
    expect(mediaReviewHref(3, { error: "source" })).toBe("/ops/media?page=3&error=source");
  });
});
