import { describe, expect, it } from "vitest";
import { PasswordSetupSchema } from "@/lib/password-policy";

describe("password setup policy", () => {
  it("accepts a confirmed long password with mixed characters", () => {
    expect(PasswordSetupSchema.safeParse({
      password: "PorticoSicuro2026",
      password_confirmation: "PorticoSicuro2026",
      mode: "invite",
    }).success).toBe(true);
  });

  it.each([
    "Corta2026",
    "tuttominuscolo2026",
    "TUTTOMAIUSCOLO2026",
    "SenzaNessunNumero",
  ])("rejects the weak password %s", (password) => {
    expect(PasswordSetupSchema.safeParse({ password, password_confirmation: password }).success).toBe(false);
  });

  it("rejects a confirmation that does not match", () => {
    const result = PasswordSetupSchema.safeParse({
      password: "PorticoSicuro2026",
      password_confirmation: "PorticoDiverso2026",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(["password_confirmation"]);
  });
});
