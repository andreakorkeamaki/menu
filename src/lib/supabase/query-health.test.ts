import { afterEach, describe, expect, it, vi } from "vitest";
import { requireSuccessfulQueries } from "@/lib/supabase/query-health";

describe("protected query health", () => {
  afterEach(() => vi.restoreAllMocks());

  it("allows a page to render only when every required read succeeded", () => {
    expect(() => requireSuccessfulQueries(
      "dashboard_loaded",
      { error: null },
      { error: null },
    )).not.toThrow();
  });

  it("fails closed with a traceable log instead of an empty success state", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => requireSuccessfulQueries(
      "dashboard_load_failed",
      { error: null },
      { error: { code: "57014", message: "query timeout" } },
    )).toThrow(/^Protected data unavailable\. Reference [0-9a-f-]{36}\.$/);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"event":"dashboard_load_failed"'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"error_code":"57014"'));
  });
});
