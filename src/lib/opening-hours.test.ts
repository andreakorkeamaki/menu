import { describe, expect, it } from "vitest";
import { parseOpeningHoursInput } from "./opening-hours";

describe("opening-hours form parsing", () => {
  it("trims complete rows and ignores an empty editor row", () => {
    const result = parseOpeningHoursInput(
      [" Lun–Ven ", ""],
      [" 12:00–14:30 · 19:00–22:30 ", ""],
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([{ days: "Lun–Ven", hours: "12:00–14:30 · 19:00–22:30" }]);
    }
  });

  it("rejects a partially completed row", () => {
    expect(parseOpeningHoursInput(["Sab–Dom"], [""]).success).toBe(false);
  });

  it("limits the number of schedule rows", () => {
    expect(parseOpeningHoursInput(Array(15).fill("Lun"), Array(15).fill("12:00–14:00")).success).toBe(false);
  });
});
