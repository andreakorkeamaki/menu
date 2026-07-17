import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

vi.mock("@/app/login/actions", () => ({ signOut: "/login" }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

describe("AppShell", () => {
  it("keeps sign-out available in the mobile navigation", () => {
    const html = renderToStaticMarkup(
      <AppShell
        area="dashboard"
        context={{
          profile: { id: "user-1", full_name: "Giulia" },
          memberships: [{ id: "member-1", organization_id: "org-1", user_id: "user-1", role: "owner" }],
          isOperator: false,
        }}
      >
        <main>Dashboard</main>
      </AppShell>,
    );

    expect(html).toContain('class="mobile-signout"');
    expect(html).toContain(">Esci</button>");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/dashboard/photos"');
  });

  it("never offers a mode switch to an operator with a legacy membership", () => {
    const html = renderToStaticMarkup(
      <AppShell
        area="ops"
        context={{
          profile: { id: "operator-1", full_name: "Andrea" },
          memberships: [{ id: "member-1", organization_id: "org-1", user_id: "operator-1", role: "owner" }],
          isOperator: true,
        }}
      >
        <main>Operazioni</main>
      </AppShell>,
    );

    expect(html).toContain('href="/ops/restaurants"');
    expect(html).not.toContain('href="/dashboard"');
    expect(html).not.toContain("Vai al ristorante");
  });
});
