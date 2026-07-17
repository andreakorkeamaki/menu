import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { stalledImportCutoff, STALLED_IMPORT_MINUTES } from "@/lib/import/recovery";
import { OPS_QUEUE_PAGE_SIZE, opsQueueHref, parseOpsQueuePage } from "@/lib/ops-queue-pagination";
import { reportServerError } from "@/lib/server-telemetry";
import { createClient } from "@/lib/supabase/server";
import { requireSuccessfulQueries } from "@/lib/supabase/query-health";

const statusLabel: Record<string, string> = {
  materials_missing: "Materiali mancanti",
  ready: "Pronto",
  importing: "Importazione",
  review: "Da revisionare",
  awaiting_customer: "In approvazione",
  published: "Pubblicato",
};

export default async function OpsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = parseOpsQueuePage(params.page);
  const rangeStart = (page - 1) * OPS_QUEUE_PAGE_SIZE;
  const stalledBefore = stalledImportCutoff();
  await requireOperator();
  const supabase = await createClient();
  const [queueResult, reviewResult, publishedResult, failedJobResult, stalledJobResult, webhookResult] = await Promise.all([
    supabase!.from("onboarding_cases")
      .select("*,organization:organizations(name,slug),location:locations(name,slug)", { count: "exact" })
      .neq("status", "published")
      .order("updated_at", { ascending: true })
      .order("created_at", { ascending: true })
      .range(rangeStart, rangeStart + OPS_QUEUE_PAGE_SIZE - 1),
    supabase!.from("onboarding_cases")
      .select("id", { count: "exact", head: true })
      .eq("status", "review"),
    supabase!.from("onboarding_cases")
      .select("id", { count: "exact", head: true })
      .eq("status", "published"),
    supabase!.from("ai_jobs")
      .select("id,onboarding_case:onboarding_cases!inner(status)", { count: "exact", head: true })
      .eq("kind", "menu_import")
      .in("status", ["failed", "cancelled"])
      .neq("onboarding_case.status", "published"),
    supabase!.from("ai_jobs")
      .select("id,onboarding_case:onboarding_cases!inner(status)", { count: "exact", head: true })
      .eq("kind", "menu_import")
      .in("status", ["pending", "queued", "running"])
      .lt("updated_at", stalledBefore)
      .neq("onboarding_case.status", "published"),
    supabase!.from("webhook_events")
      .select("id", { count: "exact", head: true })
      .is("processed_at", null)
      .not("error", "is", null),
  ]);
  requireSuccessfulQueries("ops_queue_load_failed", queueResult, reviewResult, publishedResult);
  if (failedJobResult.error) reportServerError("ops_failed_import_health_load_failed", failedJobResult.error);
  if (stalledJobResult.error) reportServerError("ops_stalled_import_health_load_failed", stalledJobResult.error);
  if (webhookResult.error) reportServerError("ops_webhook_health_load_failed", webhookResult.error);

  const rows = queueResult.data ?? [];
  const openCount = queueResult.count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(openCount / OPS_QUEUE_PAGE_SIZE));
  if (page > totalPages) redirect(opsQueueHref(totalPages));
  const firstVisible = rows.length ? rangeStart + 1 : 0;
  const lastVisible = rows.length ? rangeStart + rows.length : 0;
  const failedImports = failedJobResult.count ?? 0;
  const stalledImports = stalledJobResult.count ?? 0;
  const webhookFailures = webhookResult.count ?? 0;
  const healthUnavailable = Boolean(failedJobResult.error || stalledJobResult.error || webhookResult.error);
  const needsAttention = failedImports + stalledImports + webhookFailures;
  const reliabilityState = healthUnavailable ? "is-unknown" : needsAttention ? "has-attention" : "is-healthy";

  return (
    <main className="workspace wide-workspace">
      <header className="workspace-heading">
        <div><p className="eyebrow">Pannello operativo</p><h1>Onboarding senza fogli sparsi</h1><p>Ogni ristorante avanza da materiali incompleti a pubblicazione approvata.</p></div>
        <Link className="button button-dark" href="/ops/new">Nuovo ristorante</Link>
      </header>

      <section className="metric-grid ops-metrics">
        <article className="metric-card metric-primary"><span>Casi aperti</span><strong>{openCount}</strong><p>Totale reale: nessun caso viene escluso dalla finestra corrente.</p></article>
        <article className="metric-card"><span>Da revisionare</span><strong>{reviewResult.count ?? 0}</strong><Link href="/ops/import">Apri importazioni →</Link></article>
        <article className={`metric-card ${needsAttention && !healthUnavailable ? "metric-attention" : ""} ${healthUnavailable ? "metric-unknown" : ""}`}><span>Affidabilità</span><strong>{healthUnavailable ? "—" : needsAttention ? `${needsAttention} alert` : "OK"}</strong><Link href="/ops/import">Controlla elaborazioni →</Link></article>
        <article className="metric-card"><span>Pubblicati</span><strong>{publishedResult.count ?? 0}</strong><p>Totale storico dei ristoranti online.</p></article>
      </section>

      <section className={`ops-reliability-banner ${reliabilityState}`}>
        <span aria-hidden="true">{healthUnavailable ? "?" : needsAttention ? "!" : "✓"}</span>
        <div>
          <p className="eyebrow">Salute operativa</p>
          <h2>{healthUnavailable ? "Dati di affidabilità non disponibili" : needsAttention ? "Ci sono elaborazioni da recuperare" : "Importazioni e webhook sotto controllo"}</h2>
          <p>{healthUnavailable ? "Non mostriamo uno stato rassicurante senza dati completi. Apri la diagnostica e riprova prima di avviare altre importazioni." : needsAttention ? `${failedImports} import falliti nei casi aperti, ${stalledImports} fermi da almeno ${STALLED_IMPORT_MINUTES} minuti e ${webhookFailures} webhook da riprocessare.` : "Nessun import fallito nei casi aperti, nessun job fermo e nessun webhook in errore."}</p>
        </div>
        <Link className="button button-light" href="/ops/import">Apri diagnostica</Link>
      </section>

      <section className="dashboard-panel ops-queue">
        <div className="panel-heading">
          <div><p className="eyebrow">Coda azionabile</p><h2>I casi aperti da più tempo</h2><small>{rows.length ? `${firstVisible}–${lastVisible} di ${openCount} casi aperti` : "Nessun caso richiede intervento"}</small></div>
          <span className="count-badge">{openCount}</span>
        </div>
        {rows.length ? (
          <div className="ops-table">
            <div className="ops-table-head"><span>Ristorante</span><span>Stato</span><span>Aggiornamento</span><span>Prossima azione</span></div>
            {rows.map((row) => (
              <article key={row.id}>
                <div><strong>{row.location?.name ?? row.organization?.name ?? "Nuovo ristorante"}</strong><small>{row.contact_email ?? row.organization?.slug ?? ""}</small></div>
                <span className={`status-pill status-${row.status}`}>{statusLabel[row.status] ?? row.status}</span>
                <time dateTime={row.updated_at ?? row.created_at}>{formatDateTime(row.updated_at ?? row.created_at)}</time>
                <Link href={`/ops/import?case=${row.id}`}>{row.status === "materials_missing" ? "Carica materiali" : row.status === "review" ? "Revisiona" : "Apri"} →</Link>
              </article>
            ))}
          </div>
        ) : <div className="empty-state"><h3>Nessun caso aperto</h3><p>I nuovi onboarding appariranno qui; i ristoranti pubblicati restano inclusi nei conteggi storici.</p></div>}
        {totalPages > 1 ? (
          <nav className="ops-queue-pagination" aria-label="Pagine dei casi aperti">
            {page > 1 ? <Link href={opsQueueHref(page - 1)}>← Casi più vecchi</Link> : <span />}
            <span>Pagina {page} di {totalPages}</span>
            {page < totalPages ? <Link href={opsQueueHref(page + 1)}>Casi più recenti →</Link> : <span />}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
