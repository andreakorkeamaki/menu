import { describe, expect, it } from "vitest";
import { assessAccentPalette, contrastRatio, formatContrast, resolveAccessibleAccentPalette } from "@/lib/color-contrast";

describe("theme contrast", () => {
  it("implements the WCAG relative-luminance contrast scale", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(formatContrast(4.54)).toBe("4.5:1");
  });

  it("accepts the default restaurant palette and chooses readable button text", () => {
    const result = assessAccentPalette({
      accent: "#9d3d2e",
      background: "#f4eee4",
      surface: "#fffaf1",
    });

    expect(result.safe).toBe(true);
    expect(result.accentText).toBe("#ffffff");
    expect(result.backgroundRatio).toBeGreaterThanOrEqual(4.5);
    expect(result.surfaceRatio).toBeGreaterThanOrEqual(4.5);
  });

  it("rejects a pale accent even when dark text would make its button readable", () => {
    const result = assessAccentPalette({
      accent: "#f2c94c",
      background: "#f4eee4",
      surface: "#fffaf1",
    });

    expect(result.accentText).toBe("#171b18");
    expect(result.accentTextRatio).toBeGreaterThanOrEqual(4.5);
    expect(result.safe).toBe(false);
  });

  it("gives legacy unsafe snapshots a safe render-time fallback", () => {
    const result = resolveAccessibleAccentPalette({
      accent: "#f2c94c",
      background: "#f4eee4",
      surface: "#fffaf1",
    });

    expect(result.safe).toBe(true);
    expect(result.adjusted).toBe(true);
    expect(result.accent).toBe("#7f3127");
  });
});
