import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  report: vi.fn(() => "11111111-1111-4111-8111-111111111111"),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("react", () => ({
  cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/server-telemetry", () => ({
  reportServerError: mocks.report,
}));
vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => {
    const query = {
      select: () => query,
      eq: () => query,
      limit: async () => mocks.result,
    };
    return { from: () => query };
  },
}));

import { getPublishedMenu } from "@/lib/public-menu";

describe("public menu database reliability", () => {
  beforeEach(() => {
    mocks.report.mockClear();
    mocks.result = { data: null, error: null };
  });

  it("surfaces a transient database failure instead of pretending the menu is missing", async () => {
    mocks.result = { data: null, error: { code: "57014", message: "timeout" } };

    await expect(getPublishedMenu("real-restaurant")).rejects.toThrow(
      "Public menu data unavailable. Reference 11111111-1111-4111-8111-111111111111.",
    );
    expect(mocks.report).toHaveBeenCalledWith(
      "public_menu_load_failed",
      expect.objectContaining({ code: "57014" }),
    );
  });
});
