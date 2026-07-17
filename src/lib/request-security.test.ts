import { describe, expect, it } from "vitest";
import { clientAddressFromHeaders, requestFingerprint, retryMinutes } from "@/lib/request-security";

describe("public request security", () => {
  it("prefers Vercel's normalized client address and rejects malformed values", () => {
    expect(clientAddressFromHeaders(new Headers({
      "x-vercel-forwarded-for": "203.0.113.42",
      "x-forwarded-for": "198.51.100.8",
    }))).toBe("203.0.113.42");
    expect(clientAddressFromHeaders(new Headers({ "x-forwarded-for": "not-an-ip, 203.0.113.1" }))).toBeNull();
  });

  it("creates domain-separated fingerprints without retaining the source value", () => {
    const secret = "0123456789abcdef0123456789abcdef";
    const email = requestFingerprint(secret, "email", "OWNER@EXAMPLE.COM");
    expect(email).toMatch(/^[0-9a-f]{64}$/);
    expect(email).not.toContain("owner");
    expect(email).toBe(requestFingerprint(secret, "email", "owner@example.com"));
    expect(email).not.toBe(requestFingerprint(secret, "ip", "owner@example.com"));
  });

  it("turns a server retry window into calm whole-minute guidance", () => {
    expect(retryMinutes(1)).toBe(1);
    expect(retryMinutes(61)).toBe(2);
  });
});
