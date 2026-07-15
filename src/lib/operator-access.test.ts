import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureAllowlistedOperator,
  isAllowlistedOperatorEmail,
  parseOperatorEmailAllowlist,
} from "@/lib/operator-access";

const originalAllowlist = process.env.PLATFORM_OPERATOR_EMAILS;

afterEach(() => {
  if (originalAllowlist === undefined) delete process.env.PLATFORM_OPERATOR_EMAILS;
  else process.env.PLATFORM_OPERATOR_EMAILS = originalAllowlist;
});

describe("platform operator allowlist", () => {
  it("normalizes exact emails across supported delimiters", () => {
    expect(
      [...parseOperatorEmailAllowlist(" Andrea@Example.com;ops@example.com\n third@example.com ")],
    ).toEqual(["andrea@example.com", "ops@example.com", "third@example.com"]);
    expect(isAllowlistedOperatorEmail("ANDREA@example.com", "andrea@example.com"))
      .toBe(true);
    expect(isAllowlistedOperatorEmail("andrea+other@example.com", "andrea@example.com"))
      .toBe(false);
  });

  it("does not touch platform_staff for a non-allowlisted user", async () => {
    process.env.PLATFORM_OPERATOR_EMAILS = "andrea@example.com";
    const upsert = vi.fn();
    const admin = { from: vi.fn(() => ({ upsert })) } as unknown as SupabaseClient;

    await expect(
      ensureAllowlistedOperator({ id: "user-1", email: "other@example.com" }, admin),
    ).resolves.toBe(false);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("bootstraps an allowlisted user into database-backed authorization", async () => {
    process.env.PLATFORM_OPERATOR_EMAILS = "andrea@example.com";
    const upsert = vi.fn(async () => ({ error: null }));
    const admin = { from: vi.fn(() => ({ upsert })) } as unknown as SupabaseClient;

    await expect(
      ensureAllowlistedOperator({ id: "user-1", email: "Andrea@Example.com" }, admin),
    ).resolves.toBe(true);
    expect(admin.from).toHaveBeenCalledWith("platform_staff");
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        role: "operator",
        active: true,
        created_by: "user-1",
      },
      { onConflict: "user_id" },
    );
  });
});
