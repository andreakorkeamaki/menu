import { describe, expect, it } from "vitest";
import { sourceHash } from "@/lib/ai/source-hash";

describe("sourceHash", () => {
  it("returns a stable SHA-256 hash", () => {
    expect(sourceHash("Margherita")).toMatch(/^[a-f0-9]{64}$/);
    expect(sourceHash("Margherita")).toBe(sourceHash("Margherita"));
    expect(sourceHash("Margherita")).not.toBe(sourceHash("Marinara"));
  });

  it("hashes the exact database source text", () => {
    expect(sourceHash("cafe\u0301\r\nclassico")).not.toBe(
      sourceHash("café\nclassico"),
    );
  });
});
