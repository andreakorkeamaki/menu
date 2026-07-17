import { describe, expect, it } from "vitest";
import { parsePublicationHistoryPage, publicationHistoryHref } from "@/lib/publication-history-pagination";

describe("publication history pagination", () => {
  it("rejects forged or ambiguous page values", () => {
    expect(parsePublicationHistoryPage("3x")).toBe(1);
    expect(parsePublicationHistoryPage("-1")).toBe(1);
    expect(parsePublicationHistoryPage("2")).toBe(2);
  });

  it("keeps the first page URL canonical", () => {
    expect(publicationHistoryHref(1)).toBe("/dashboard/menu/review");
    expect(publicationHistoryHref(4)).toBe("/dashboard/menu/review?history_page=4");
  });
});
