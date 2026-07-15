import Link from "next/link";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";

export default async function DashboardPage() {
  const { membership, profile } = await requireMembership();
  const supabase = await createClient();
  const orgId = membership.organization_id;
  const [locationResult, menuResult, staleResult] = await Promise.all([
    supabase!.from("locations").select("id,name,slug,status").eq("organization_id", orgId).eq("status", "active").limit(1).maybeSingle(),
    supabase!.from("menus").select("id,name,current_publication_id,updated_at").eq("organization_id", orgId).limit(1).maybeSingle(),
    supabase!.from("translations").select("id", { count: "exact", head: true }).eq("organization_id", orgId).in("status", ["missing", "stale", "error"]),
  ]);
  const location = locationResult.data;
  const menu = menuResult.data;
  return (
    <main className="workspace">
      <header className="workspace-heading">
        <div><p className="eyebrow">Buongiorno, {profile.full_name}</p><h1>{location?.name ?? "Il tuo ristorante"}</h1><p>Controlla cosa è online e completa le modifiche che richiedono attenzione.</p></div>
        {location?.slug && <Link className="button button-light" href={`/r/${location.slug}`} target="_blank">Apri il sito ↗</Link>}
      </header>
      <section className="metric-grid">
        <article className="metric-card metric-primary"><span>Stato menu</span><strong>{menu?.current_publication_id ? "Pubblicato" : "In bozza"}</strong><p>{menu?.updated_at ? `Ultima modifica ${formatDateTime(menu.updated_at)}` : "Completa il primo menu"}</p></article>
        <article className="metric-card"><span>Traduzioni da rivedere</span><strong>{staleResult.count ?? 0}</strong><Link href="/dashboard/translations">Apri la coda →</Link></article>
        <article className="metric-card"><span>QR stabile</span><strong>{location?.slug ? "Attivo" : "Da creare"}</strong><Link href="/dashboard/site">Gestisci sito e QR →</Link></article>
      </section>
      <section className="dashboard-grid">
        <article className="dashboard-panel"><div className="panel-heading"><div><p className="eyebrow">Azioni rapide</p><h2>Cosa vuoi aggiornare?</h2></div></div><div className="quick-actions"><Link href="/dashboard/menu">Cambia prezzo o disponibilità <span>→</span></Link><Link href="/dashboard/translations">Revisiona le traduzioni <span>→</span></Link><Link href="/dashboard/site">Aggiorna orari e contatti <span>→</span></Link></div></article>
        <article className="dashboard-panel publication-panel"><p className="eyebrow">Pubblicazione controllata</p><h2>La versione online resta al sicuro.</h2><p>Le modifiche testuali non sostituiscono il menu pubblicato finché le relative traduzioni non sono approvate.</p>{menu?.id && <form action="/dashboard/menu"><button className="button button-dark">Vai al menu</button></form>}</article>
      </section>
    </main>
  );
}
