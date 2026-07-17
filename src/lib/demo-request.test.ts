import { describe, expect, it } from "vitest";
import { parseDemoRequestFormData } from "./demo-request";

function validForm() {
  const form = new FormData();
  form.set("restaurant_name", "Osteria del Portico");
  form.set("city", "Bologna");
  form.set("contact_name", "Giulia Rossi");
  form.set("email", "GIULIA@example.com");
  form.set("contact_role", "owner");
  form.set("current_menu_url", "https://example.com/menu.pdf");
  form.append("desired_languages", "en");
  form.append("desired_languages", "de");
  form.set("privacy_consent", "on");
  return form;
}

describe("parseDemoRequestFormData", () => {
  it("normalizes a complete request", () => {
    const parsed = parseDemoRequestFormData(validForm());

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe("giulia@example.com");
      expect(parsed.data.desired_languages).toEqual(["en", "de"]);
      expect(parsed.data.phone).toBeUndefined();
    }
  });

  it("rejects non-http menu links and missing consent", () => {
    const form = validForm();
    form.set("current_menu_url", "javascript:alert(1)");
    form.delete("privacy_consent");

    const parsed = parseDemoRequestFormData(form);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.current_menu_url).toBeDefined();
      expect(parsed.error.flatten().fieldErrors.privacy_consent).toBeDefined();
    }
  });
});
