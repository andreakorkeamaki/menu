import { describe, expect, it } from "vitest";
import { buildDashboardGuide } from "@/lib/dashboard-guide";

describe("dashboard guide", () => {
  it("routes a new restaurant to the earliest blocking product step", () => {
    const guide = buildDashboardGuide({ blockerCodes: ["location", "items", "translations"], published: false });
    expect(guide.next.id).toBe("site");
    expect(guide.actionLabel).toBe("Completa il sito");
    expect(guide.percent).toBe(0);
  });

  it("moves a ready draft to an explicit final review", () => {
    const guide = buildDashboardGuide({ blockerCodes: [], published: false });
    expect(guide.next.href).toBe("/dashboard/menu/review");
    expect(guide.percent).toBe(75);
  });

  it("shows a published restaurant as complete until new blockers appear", () => {
    expect(buildDashboardGuide({ blockerCodes: [], published: true }).complete).toBe(true);
    expect(buildDashboardGuide({ blockerCodes: ["translations"], published: true }).next.id).toBe("translations");
  });
});
