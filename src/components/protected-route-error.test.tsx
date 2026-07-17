import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProtectedRouteError } from "@/components/protected-route-error";

describe("ProtectedRouteError", () => {
  it("gives restaurant users a safe in-context retry with a support reference", () => {
    const reference = "c0ffee00-0000-4000-8000-000000000001";
    const html = renderToStaticMarkup(
      <ProtectedRouteError
        area="dashboard"
        error={new Error(`Protected data unavailable. Reference ${reference}.`)}
        reset={vi.fn()}
      />,
    );

    expect(html).toContain("Non mostriamo informazioni incomplete");
    expect(html).toContain("La versione online");
    expect(html).toContain(reference);
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("Riprova ora");
  });

  it("warns operators not to launch more work from a stale queue", () => {
    const html = renderToStaticMarkup(
      <ProtectedRouteError
        area="ops"
        error={Object.assign(new Error("unavailable"), { digest: "digest-ops-1" })}
        reset={vi.fn()}
      />,
    );

    expect(html).toContain("La coda operativa potrebbe non essere aggiornata");
    expect(html).toContain("digest-ops-1");
    expect(html).toContain('href="/ops"');
  });
});
