import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OpeningHoursEditor } from "./opening-hours-editor";

describe("OpeningHoursEditor", () => {
  it("renders existing schedules as accessible repeated form fields", () => {
    const html = renderToStaticMarkup(
      <OpeningHoursEditor initialRows={[{ days: "Lun–Ven", hours: "12:00–14:30" }]} />,
    );

    expect(html).toContain("Orari di apertura");
    expect(html).toContain('name="opening_days"');
    expect(html).toContain('value="Lun–Ven"');
    expect(html).toContain('name="opening_times"');
    expect(html).toContain('value="12:00–14:30"');
    expect(html).toContain("Rimuovi fascia oraria 1");
    expect(html).toContain("Aggiungi fascia oraria");
  });
});
