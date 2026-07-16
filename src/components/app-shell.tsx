import Link from "next/link";
import { Brand } from "@/components/brand";
import type { UserContext } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

type ShellArea = "dashboard" | "ops";

export function AppShell({ children, context, area }: { children: React.ReactNode; context: UserContext; area: ShellArea }) {
  const dashboardLinks = [
    ["/dashboard", "Panoramica"],
    ["/dashboard/menu", "Menu"],
    ["/dashboard/translations", "Traduzioni"],
    ["/dashboard/site", "Sito e aspetto"],
    ["/dashboard/team", "Utenti"],
  ];
  const opsLinks = [
    ["/ops", "Coda onboarding"],
    ["/ops/new", "Nuovo ristorante"],
    ["/ops/import", "Importazioni"],
  ];
  const links = area === "ops" ? opsLinks : dashboardLinks;
  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <Brand />
        <nav aria-label={area === "ops" ? "Pannello operativo" : "Dashboard ristorante"}>
          {links.map(([href, label]) => <Link href={href} key={href}>{label}</Link>)}
        </nav>
        {context.isOperator && (area === "dashboard" || context.memberships.length > 0) && (
          <Link className="mode-switch" href={area === "ops" ? "/dashboard" : "/ops"}>
            {area === "ops" ? "Vai al ristorante" : "Pannello operatore"}
          </Link>
        )}
        <form action={signOut}><button className="sidebar-signout">Esci</button></form>
      </aside>
      <div className="app-main">
        <header className="app-mobile-header">
          <div><Brand compact /><span>{context.profile.full_name}</span></div>
          <nav aria-label={area === "ops" ? "Navigazione operatore mobile" : "Navigazione ristorante mobile"}>
            {links.map(([href, label]) => <Link href={href} key={href}>{label}</Link>)}
            {context.isOperator && (area === "dashboard" || context.memberships.length > 0) && (
              <Link className="mobile-mode-switch" href={area === "ops" ? "/dashboard" : "/ops"}>
                {area === "ops" ? "Ristorante" : "Operatore"}
              </Link>
            )}
            <form action={signOut}><button className="mobile-signout">Esci</button></form>
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}
