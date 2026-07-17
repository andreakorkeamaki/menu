import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/safe-navigation";

describe("safe internal navigation", () => {
  it("preserves an application path with its query string", () => {
    expect(safeInternalPath("/login/reset-password?mode=invite")).toBe("/login/reset-password?mode=invite");
  });

  it.each([
    "//evil.example/path",
    "/\\evil.example/path",
    "https://evil.example/path",
    "javascript:alert(1)",
    "dashboard",
  ])("rejects the external or malformed destination %s", (value) => {
    expect(safeInternalPath(value)).toBe("/dashboard");
  });
});
