import { describe, expect, it } from "vitest";
import { OptionalHttpUrlSchema, safeHttpUrl } from "./safe-url";

describe("safeHttpUrl", () => {
  it("accepts only absolute HTTP URLs", () => {
    expect(safeHttpUrl("https://example.com/prenota")).toBe("https://example.com/prenota");
    expect(safeHttpUrl("http://localhost:3000/demo")).toBe("http://localhost:3000/demo");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("//example.com")).toBeNull();
  });

  it("allows empty optional form values but rejects other schemes", () => {
    expect(OptionalHttpUrlSchema.safeParse("").success).toBe(true);
    expect(OptionalHttpUrlSchema.safeParse("https://instagram.com/osteria").success).toBe(true);
    expect(OptionalHttpUrlSchema.safeParse("data:text/html,hello").success).toBe(false);
  });
});
