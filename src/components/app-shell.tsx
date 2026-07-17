import { Brand } from "@/components/brand";
import type { UserContext } from "@/lib/auth";
import type { Membership } from "@/types/domain";
import { signOut } from "@/app/login/actions";
import { switchOrganization } from "@/app/dashboard/workspace-actions";
import { WorkspaceDraftGuard } from "@/components/workspace-draft-guard";
import { AppShellNav } from "@/components/app-shell-nav";

type ShellArea = "dashboard" | "ops";

export function AppShell({ children, context, area, activeMembership }: { children: React.ReactNode; context: UserContext; area: ShellArea; activeMembership?: Membership }) {
  const dashboardLinks = [
    ["/dashboard", "Panoramica"],
    ["/dashboard/menu", "Menu"],
    ["/dashboard/photos", "Foto"],
    ["/dashboard/translations", "Traduzioni"],
    ["/dashboard/site", "Sito e aspetto"],
    ["/dashboard/team", "Utenti"],
  ];
  const opsLinks = [
    ["/ops", "Coda onboarding"],
    ["/ops/restaurants", "Ristoranti"],
    ["/ops/leads", "Richieste demo"],
    ["/ops/media", "Immagini"],
    ["/ops/new", "Nuovo ristorante"],
    ["/ops/import", "Importazioni"],
  ];
  const links = area === "ops" ? opsLinks : dashboardLinks;
  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <Brand />
        {area === "dashboard" && activeMembership ? (
          <div className="workspace-switcher">
            <span>Ristorante attivo</span>
            {context.memberships.length > 1 ? (
              <form action={switchOrganization}>
                <label className="sr-only" htmlFor="desktop-organization">Ristorante attivo</label>
                <select id="desktop-organization" name="organization_id" defaultValue={activeMembership.organization_id}>
                  {context.memberships.map((membership) => <option value={membership.organization_id} key={membership.id}>{membership.organization?.name ?? "Ristorante"}</option>)}
                </select>
                <button>Cambia</button>
              </form>
            ) : <strong>{activeMembership.organization?.name ?? "Ristorante"}</strong>}
          </div>
        ) : null}
        <p className="sidebar-nav-label">{area === "ops" ? "Operazioni" : "Il tuo spazio"}</p>
        <nav aria-label={area === "ops" ? "Pannello operativo" : "Dashboard ristorante"}>
          <AppShellNav links={links} />
        </nav>
        <form action={signOut}><button className="sidebar-signout">Esci</button></form>
      </aside>
      <div className="app-main">
        <header className="app-mobile-header">
          <div><Brand compact /><span>{area === "dashboard" ? activeMembership?.organization?.name ?? context.profile.full_name : context.profile.full_name}</span></div>
          {area === "dashboard" && activeMembership && context.memberships.length > 1 ? (
            <form action={switchOrganization} className="mobile-workspace-switcher">
              <label className="sr-only" htmlFor="mobile-organization">Ristorante attivo</label>
              <select id="mobile-organization" name="organization_id" defaultValue={activeMembership.organization_id}>
                {context.memberships.map((membership) => <option value={membership.organization_id} key={membership.id}>{membership.organization?.name ?? "Ristorante"}</option>)}
              </select>
              <button>Cambia</button>
            </form>
          ) : null}
          <nav aria-label={area === "ops" ? "Navigazione operatore mobile" : "Navigazione ristorante mobile"}>
            <AppShellNav links={links} />
            <form action={signOut}><button className="mobile-signout">Esci</button></form>
          </nav>
        </header>
        <WorkspaceDraftGuard>{children}</WorkspaceDraftGuard>
      </div>
    </div>
  );
}
