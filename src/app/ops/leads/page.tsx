import Link from "next/link";
import { updateDemoRequestStatus } from "@/app/ops/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { requireOperator } from "@/lib/auth";
import { DemoRequestHealthSchema, type DemoRequestStatus, DEMO_REQUEST_STATUSES } from "@/lib/demo-request";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { requireSuccessfulQueries } from "@/lib/supabase/query-health";
import { reportServerError } from "@/lib/server-telemetry";
import { LEAD_PAGE_SIZE, leadListHref, parseLeadPage } from "@/lib/lead-list";
import { redirect } from "next/navigation";

const statusLabels: Record<DemoRequestStatus, string> = {
  new: "Nuova",
  contacted: "Contattata",
  qualified: "Qualificata",
  converted: "Convertita",
  closed: "Chiusa",
};

const roleLabels: Record<string, string> = {
  owner: "Titolare",
  manager: "Responsabile",
  consultant: "Consulente o agenzia",
  other: "Altro",
};

const languageLabels: Record<string, string> = {
  en: "Inglese",
  fr: "Francese",
  de: "Tedesco",
  es: "Spagnolo",
};

function isStatus(value: string | undefined): value is DemoRequestStatus {
  return DEMO_REQUEST_STATUSES.some((status) => status === value);
}

export default async function DemoRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; updated?: string; error?: string; page?: string }>;
}) {
  const params = await searchParams;
  const selectedStatus = isStatus(params.status) ? params.status : null;
  const page = parseLeadPage(params.page);
  const rangeStart = (page - 1) * LEAD_PAGE_SIZE;
  await requireOperator();
  if (params.status && !selectedStatus) redirect(leadListHref({ status: null }));
  const supabase = await createClient();
  let requestQuery = supabase!.from("demo_requests")
      .select("id,status,restaurant_name,city,contact_name,email,phone,contact_role,current_menu_url,desired_languages,notes,organization_id,onboarding_case_id,converted_at,created_at,updated_at")
      .order("created_at", { ascending: false })
      .range(rangeStart, rangeStart + LEAD_PAGE_SIZE - 1);
  if (selectedStatus) requestQuery = requestQuery.eq("status", selectedStatus);
  const [requestResult, healthResult, statusResults] = await Promise.all([
    requestQuery,
    supabase!.rpc("demo_request_health"),
    Promise.all(DEMO_REQUEST_STATUSES.map((status) => supabase!.from("demo_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", status))),
  ]);
  requireSuccessfulQueries("ops_demo_requests_load_failed", requestResult, ...statusResults);
  if (healthResult.error) reportServerError("ops_demo_health_load_failed", healthResult.error);
  const requests = requestResult.data ?? [];
  const statusCounts = Object.fromEntries(DEMO_REQUEST_STATUSES.map((status, index) => [status, statusResults[index].count ?? 0])) as Record<DemoRequestStatus, number>;
  const allRequestCount = DEMO_REQUEST_STATUSES.reduce((count, status) => count + statusCounts[status], 0);
  const filteredRequestCount = selectedStatus ? statusCounts[selectedStatus] : allRequestCount;
  const totalPages = Math.max(1, Math.ceil(filteredRequestCount / LEAD_PAGE_SIZE));
  if (page > totalPages) redirect(leadListHref({
    status: selectedStatus,
    page: totalPages,
    updated: Boolean(params.updated),
    error: params.error,
  }));
  const firstVisible = requests.length ? rangeStart + 1 : 0;
  const lastVisible = requests.length ? rangeStart + requests.length : 0;
  const healthParsed = DemoRequestHealthSchema.safeParse(healthResult.data);
  if (!healthResult.error && !healthParsed.success) {
    reportServerError("ops_demo_health_schema_invalid", healthParsed.error);
  }
  const health = healthParsed.success ? healthParsed.data : null;

  return (
    <main className="workspace wide-workspace">
      <header className="workspace-heading">
        <div>
          <p className="eyebrow">Acquisizione</p>
          <h1>Richieste demo</h1>
          <p>Dal primo contatto al ristorante qualificato, senza perdere il contesto inviato dal cliente.</p>
        </div>
        <Link className="button button-dark" href="/ops/new">Crea ristorante qualificato</Link>
      </header>

      {params.updated ? <p className="form-success" role="status">Stato della richiesta aggiornato.</p> : null}
      {params.error ? <p className="form-error" role="alert">{params.error === "use-conversion" ? "Per segnare una richiesta come Convertita, usa “Crea ristorante”: tenant e onboarding verranno collegati automaticamente." : "Non è stato possibile aggiornare la richiesta."}</p> : null}

      <section className="lead-metrics" aria-label="Riepilogo richieste">
        {(["new", "contacted", "qualified"] as const).map((status) => (
          <article key={status}>
            <span>{statusLabels[status]}</span>
            <strong>{statusCounts[status]}</strong>
          </article>
        ))}
      </section>

      <section className={`intake-health ${health ? "is-healthy" : "is-degraded"}`} aria-labelledby="intake-health-title">
        <div className="intake-health-intro">
          <span aria-hidden="true">{health ? "✓" : "!"}</span>
          <div><p className="eyebrow">Affidabilità intake</p><h2 id="intake-health-title">{health ? "Modulo protetto e osservabile" : "Telemetria non disponibile"}</h2><p>{health ? "Quote atomiche, deduplicazione e segnali anti-bot sono attivi senza conservare indirizzi IP in chiaro." : "Le richieste restano visibili, ma controlla la migrazione e i permessi della telemetria prima del rilascio."}</p></div>
        </div>
        {health ? (
          <dl>
            <div><dt>Ricevute · 24h</dt><dd>{health.accepted_24h}</dd></div>
            <div><dt>Ricevute · 7 giorni</dt><dd>{health.accepted_7d}</dd></div>
            <div><dt>Duplicate · 24h</dt><dd>{health.duplicate_24h}</dd></div>
            <div><dt>Bloccate · 24h</dt><dd>{health.blocked_24h}</dd></div>
          </dl>
        ) : null}
        <small>{health?.last_accepted_at ? `Ultima richiesta valida ${formatDateTime(health.last_accepted_at)}` : health ? "Nessuna richiesta valida ancora registrata." : "Stato RPC non verificato."}</small>
      </section>

      <nav className="lead-filters" aria-label="Filtra richieste per stato">
        <Link className={!selectedStatus ? "active" : ""} href={leadListHref({ status: null })}>Tutte <span>{allRequestCount}</span></Link>
        {DEMO_REQUEST_STATUSES.map((status) => (
          <Link className={selectedStatus === status ? "active" : ""} href={leadListHref({ status })} key={status}>
            {statusLabels[status]} <span>{statusCounts[status]}</span>
          </Link>
        ))}
      </nav>

      {requests.length ? (
        <section className="lead-list" aria-label="Elenco richieste demo">
          <div className="lead-list-heading"><p>{firstVisible}–{lastVisible} di {filteredRequestCount} {selectedStatus ? `richieste ${statusLabels[selectedStatus].toLocaleLowerCase("it")}` : "richieste"}</p></div>
          {requests.map((request) => {
            const desiredLanguages = Array.isArray(request.desired_languages) ? request.desired_languages : [];
            return (
              <article className="lead-card" key={request.id}>
                <header>
                  <div>
                    <span className={`status-pill status-${request.status}`}>{statusLabels[request.status as DemoRequestStatus]}</span>
                    <h2>{request.restaurant_name}</h2>
                    <p>{request.city} · {roleLabels[request.contact_role] ?? request.contact_role}</p>
                  </div>
                  <time dateTime={request.created_at}>{formatDateTime(request.created_at)}</time>
                </header>

                <div className="lead-card-body">
                  <div className="lead-contact">
                    <p className="eyebrow">Contatto</p>
                    <strong>{request.contact_name}</strong>
                    <a href={`mailto:${request.email}`}>{request.email}</a>
                    {request.phone ? <a href={`tel:${request.phone.replace(/\s/g, "")}`}>{request.phone}</a> : null}
                  </div>
                  <div>
                    <p className="eyebrow">Contesto</p>
                    {desiredLanguages.length ? <p>Lingue: {desiredLanguages.map((locale) => languageLabels[locale] ?? locale.toUpperCase()).join(", ")}</p> : <p>Nessuna lingua indicata.</p>}
                    {request.notes ? <blockquote>{request.notes}</blockquote> : null}
                    {request.current_menu_url ? <a className="text-link" href={request.current_menu_url} target="_blank" rel="noreferrer">Apri il menu attuale ↗</a> : null}
                  </div>
                </div>

                {request.status === "converted" && request.onboarding_case_id ? (
                  <div className="lead-conversion-result"><div><span aria-hidden="true">✓</span><p><strong>Tenant collegato</strong><small>{request.converted_at ? `Convertita ${formatDateTime(request.converted_at)}` : "Conversione completata"}</small></p></div><Link className="button button-dark" href={`/ops/import?case=${request.onboarding_case_id}`}>Apri onboarding →</Link></div>
                ) : (
                  <div className="lead-card-actions">
                    <form action={updateDemoRequestStatus} className="lead-status-form">
                      <input type="hidden" name="request_id" value={request.id} />
                      <input type="hidden" name="return_status" value={selectedStatus ?? ""} />
                      <input type="hidden" name="return_page" value={page} />
                      <label>Stato
                        <select name="status" defaultValue={request.status}>
                          {DEMO_REQUEST_STATUSES.filter((status) => status !== "converted").map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}
                        </select>
                      </label>
                      <PendingSubmitButton className="button button-light" pendingLabel="Aggiornamento…">Aggiorna</PendingSubmitButton>
                    </form>
                    {request.status !== "closed" ? <Link className="button button-dark" href={`/ops/new?lead=${request.id}`}>Crea ristorante →</Link> : null}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      ) : (
        <section className="empty-state">
          <h2>{selectedStatus ? `Nessuna richiesta ${statusLabels[selectedStatus].toLocaleLowerCase("it")}` : "Nessuna richiesta demo"}</h2>
          <p>Le richieste inviate dal sito appariranno qui con tutto il contesto necessario al follow-up.</p>
        </section>
      )}
      {totalPages > 1 ? (
        <nav className="lead-list-pagination" aria-label="Pagine delle richieste demo">
          {page > 1 ? <Link href={leadListHref({ status: selectedStatus, page: page - 1 })}>← Più recenti</Link> : <span />}
          <span>Pagina {page} di {totalPages}</span>
          {page < totalPages ? <Link href={leadListHref({ status: selectedStatus, page: page + 1 })}>Più vecchie →</Link> : <span />}
        </nav>
      ) : null}
    </main>
  );
}
