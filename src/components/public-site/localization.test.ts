import { describe, expect, it } from "vitest";
import { localizeAllergen, localizeOpeningDays, localizedMenuName } from "./localization";

describe("public menu system-copy localization", () => {
  it("localizes canonical allergen codes and legacy Italian labels", () => {
    expect(localizeAllergen("milk", "de")).toBe("Milch");
    expect(localizeAllergen("Uova", "en")).toBe("Eggs");
    expect(localizeAllergen("Frutta a guscio", "es")).toBe("Frutos de cáscara");
  });

  it("preserves a custom allergen label that is not in the EU canonical set", () => {
    expect(localizeAllergen("Aglio", "en")).toBe("Aglio");
  });

  it("localizes common opening-day ranges without touching unknown schedules", () => {
    expect(localizeOpeningDays("Lun–Ven", "en")).toBe("Mon–Fri");
    expect(localizeOpeningDays("Sab–Dom", "de")).toBe("Sa–So");
    expect(localizeOpeningDays("Solo su prenotazione", "fr")).toBe("Solo su prenotazione");
  });

  it("supports both localized and legacy string menu names", () => {
    expect(localizedMenuName({ it: "Menu principale", en: "Main menu" }, "en")).toBe("Main menu");
    expect(localizedMenuName("Carta dei vini", "en")).toBe("Carta dei vini");
  });
});
