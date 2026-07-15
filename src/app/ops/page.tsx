import Link from "next/link";
import { requireOperator } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";

const statusLabel: Record<string, string> = { materials_missing: "Materiali mancanti", ready: "Pronto", importing: "Importazione", review: "Da revisionare", awaiting_customer: "In approvazione", published: "Pubblicato" };

export default async function OpsPage() {
  await requireOperator();
  const supabase = await createClient();
  const { data } = await supabase!.from("onboarding_cases").select("*,organization:organizations(name,slug),location:locations(name,slug)").order("created_at", { ascending: false }).limit(100);
  const rows = data ?? [];
  const open = rows.filter((row) => row.status !== "published");
  return (
    <main className="workspace wide-workspace">
      <header className="workspace-heading"><div><p className="eyebrow">Pannello operativo</p><h1>Onboarding senza fogli sparsi</h1><p>Ogni ristorante avanza da materiali incompleti a pubblicazione approvata.</p></div><Link className="button button-dark" href="/ops/new">Nuovo ristorante</Link></header>
      <section className="metric-grid"><article className="metric-card metric-primary"><span>Casi aperti</span><strong>{open.length}</strong><p>Richiedono un’azione interna o del cliente.</p></article><article className="metric-card"><span>Da revisionare</span><strong>{rows.filter((row) => row.status === "review").length}</strong><Link href="/ops/import">Apri importazioni →</Link></article><article className="metric-card"><span>Pubblicati</span><strong>{rows.filter((row) => row.status === "published").length}</strong><p>Nel dataset corrente</p></article></section>
      <section className="dashboard-panel ops-queue"><div className="panel-heading"><div><p className="eyebrow">Coda</p><h2>Ristoranti in lavorazione</h2></div><span className="count-badge">{rows.length}</span></div>{rows.length ? <div className="ops-table"><div className="ops-table-head"><span>Ristorante</span><span>Stato</span><span>Aggiornamento</span><span>Prossima azione</span></div>{rows.map((row) => <article key={row.id}><div><strong>{row.location?.name ?? row.organization?.name ?? "Nuovo ristorante"}</strong><small>{row.contact_email ?? row.organization?.slug ?? ""}</small></div><span className={`status-pill status-${row.status}`}>{statusLabel[row.status] ?? row.status}</span><time>{formatDateTime(row.updated_at ?? row.created_at)}</time><Link href={`/ops/import?case=${row.id}`}>{row.status === "materials_missing" ? "Carica materiali" : row.status === "review" ? "Revisiona" : "Apri"} →</Link></article>)}</div> : <div className="empty-state"><h3>Nessun onboarding</h3><p>Crea il primo ristorante pilota per iniziare.</p></div>}</section>
    </main>
  );
}
