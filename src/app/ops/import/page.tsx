import {
  approveMenuImport,
  retryMenuImport,
  saveMenuImportStaging,
  uploadIntakeMaterial,
} from "@/app/ops/actions";
import { AiJobMonitor } from "@/components/ops/ai-job-monitor";
import { StagingDecisionEditor } from "@/components/ops/staging-decision-editor";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import type { ImportIssue, MenuImportStaging } from "@/lib/ai/schemas";
import { requireOperator } from "@/lib/auth";
import { formatCurrency, formatDateTime } from "@/lib/format";
import {
  getStagingReviewSummary,
  isActionableIssue,
  normalizeMenuImportStaging,
} from "@/lib/import/staging-review";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isImportStalled, MAX_IMPORT_ATTEMPTS } from "@/lib/import/recovery";
import { requireSuccessfulQueries } from "@/lib/supabase/query-health";
import { reportServerError } from "@/lib/server-telemetry";
import { IMPORT_CASE_PAGE_SIZE, importWorkspaceHref, parseImportCasePage } from "@/lib/import-case-pagination";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";

function relationName(value: { name?: string } | { name?: string }[] | null | undefined) {
  return (Array.isArray(value) ? value[0]?.name : value?.name) ?? "";
}

function formatJobError(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return { message: value, reference: null };
  if (typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    const reference = "reference" in value ? (value as { reference?: unknown }).reference : null;
    if (typeof message === "string") return { message, reference: typeof reference === "string" ? reference : null };
  }
  return { message: "Errore non dettagliato", reference: null };
}

function jobSourceFilename(value: unknown) {
  if (!value || typeof value !== "object" || !("filename" in value)) return "Documento importato";
  const filename = (value as { filename?: unknown }).filename;
  return typeof filename === "string" ? filename : "Documento importato";
}

const jobStatusLabel: Record<string, string> = {
  pending: "In attesa",
  queued: "In coda",
  running: "In elaborazione",
  review: "Da revisionare",
  completed: "Completato",
  failed: "Non riuscito",
  cancelled: "Annullato",
};

function issueSummary(issues: ImportIssue[]) {
  const actionable = issues.filter(isActionableIssue);
  if (!actionable.length) return null;
  return (
    <ul className="staging-issues">
      {actionable.map((issue, index) => (
        <li className={`issue-${issue.severity}`} key={`${issue.path}-${issue.code}-${index}`}>
          <strong>{issue.severity === "error" ? "Da risolvere" : "Controlla"}</strong>
          <span>{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}

const errorMessages: Record<string, string> = {
  "invalid-file": "Seleziona un file valido.",
  "file-too-large": "Il file supera il limite di 20 MB.",
  "file-type": "Formato non supportato.",
  upload: "Il caricamento nell’area privata non è riuscito.",
  queue: "Non è stato possibile creare il job di importazione.",
  processing: "L’elaborazione non è partita o non ha prodotto una bozza valida. Puoi riprovare usando il file privato già caricato.",
  "retry-invalid": "La richiesta di nuovo tentativo non è valida.",
  "retry-unavailable": "Questo job è già in elaborazione, contiene una revisione oppure ha raggiunto il limite di tentativi.",
  "retry-missing": "Il job da riprovare non esiste più.",
  "retry-claim": "Non è stato possibile riservare il job per un nuovo tentativo.",
  "retry-source": "La fonte privata non può essere riutilizzata in sicurezza. Carica nuovamente il documento.",
  "retry-processing": "Anche il nuovo tentativo non è riuscito. Il file resta privato e il riferimento tecnico è disponibile qui sotto.",
  "invalid-json": "Il JSON corretto non è sintatticamente valido.",
  "invalid-staging-schema": "Lo staging non rispetta lo schema richiesto: controlla campi, null e tipi.",
  "save-staging": "La revisione non è stata salvata; potrebbe essere già approvata.",
  "review-required": "Completa le sole decisioni indicate (suggerimenti AI, prezzi o supplementi) prima dell’approvazione.",
  approval: "L’approvazione transazionale non è riuscita; la bozza non è stata modificata.",
  "invalid-case": "Il collegamento al caso non è valido. Abbiamo aperto la coda disponibile.",
  "case-missing": "Il caso richiesto non esiste più. Abbiamo aperto la coda disponibile.",
};

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{
    case?: string;
    stage?: string;
    uploaded?: string;
    job?: string;
    provisioned?: string;
    invitation?: string;
    qr?: string;
    saved?: string;
    approved?: string;
    lead_converted?: string;
    retried?: string;
    reference?: string;
    error?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  await requireOperator();
  const page = parseImportCasePage(params.page);
  const requestedCaseId = params.case ? z.uuid().safeParse(params.case) : null;
  const supabase = await createClient();
  const caseRangeStart = (page - 1) * IMPORT_CASE_PAGE_SIZE;
  const [caseResult, requestedCaseResult] = await Promise.all([
    supabase!.from("onboarding_cases")
      .select("id,organization_id,status,contact_email,source_file_path,created_at,organization:organizations(name),location:locations(name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(caseRangeStart, caseRangeStart + IMPORT_CASE_PAGE_SIZE - 1),
    supabase!.from("onboarding_cases")
      .select("id,organization_id,status,contact_email,source_file_path,created_at,organization:organizations(name),location:locations(name)")
      .eq("id", requestedCaseId?.success ? requestedCaseId.data : "00000000-0000-0000-0000-000000000000")
      .maybeSingle(),
  ]);
  requireSuccessfulQueries(
    "ops_import_workspace_load_failed",
    caseResult, requestedCaseResult,
  );
  const cases = caseResult.data ?? [];
  const caseTotal = caseResult.count ?? cases.length;
  const caseTotalPages = Math.max(1, Math.ceil(caseTotal / IMPORT_CASE_PAGE_SIZE));
  if (params.case && !requestedCaseId?.success) {
    redirect(importWorkspaceHref({ page: Math.min(page, caseTotalPages), error: "invalid-case" }));
  }
  if (requestedCaseId?.success && !requestedCaseResult.data) {
    redirect(importWorkspaceHref({ page: Math.min(page, caseTotalPages), error: "case-missing" }));
  }
  if (page > caseTotalPages) {
    redirect(importWorkspaceHref({
      page: caseTotalPages,
      caseId: requestedCaseId?.success ? requestedCaseId.data : undefined,
    }));
  }
  const selected = requestedCaseResult.data ?? cases[0];
  const selectedCaseId = selected?.id ?? "00000000-0000-0000-0000-000000000000";
  const [jobResult, stageResult] = await Promise.all([
    supabase!.from("ai_jobs")
      .select("id,onboarding_case_id,status,model,attempts,input,error,provider_file_released_at,created_at,updated_at,started_at,completed_at")
      .eq("kind", "menu_import")
      .eq("onboarding_case_id", selectedCaseId)
      .order("created_at", { ascending: false }),
    supabase!.from("menu_import_staging")
      .select("id,organization_id,onboarding_case_id,ai_job_id,source_bucket,source_path,source_filename,source_mime_type,parser,payload,status,revision,approval_summary,created_at,updated_at")
      .eq("onboarding_case_id", selectedCaseId)
      .order("created_at", { ascending: false }),
  ]);
  requireSuccessfulQueries("ops_import_case_load_failed", jobResult, stageResult);
  const caseStages = stageResult.data ?? [];
  const caseJobs = jobResult.data ?? [];
  const selectedOutsidePage = Boolean(selected && !cases.some((entry) => entry.id === selected.id));
  const firstVisibleCase = cases.length ? caseRangeStart + 1 : 0;
  const lastVisibleCase = cases.length ? caseRangeStart + cases.length : 0;
  const activeJobCount = caseJobs.filter((job) =>
    ["pending", "queued", "running"].includes(job.status),
  ).length;
  const failedJobCount = caseJobs.filter((job) => ["failed", "cancelled"].includes(job.status)).length;
  const stalledJobCount = caseJobs.filter((job) => isImportStalled(job.status, job.updated_at)).length;
  const selectedStage = caseStages.find((entry) => entry.id === params.stage) ?? caseStages[0];
  let parsedStaging: MenuImportStaging | null = null;
  if (selectedStage) {
    try {
      parsedStaging = normalizeMenuImportStaging(selectedStage.payload, selectedStage.parser);
    } catch {
      parsedStaging = null;
    }
  }
  const reviewSummary = parsedStaging ? getStagingReviewSummary(parsedStaging) : null;
  let sourceUrl: string | null = null;
  if (selectedStage) {
    const { data, error } = await createAdminClient().storage
      .from(selectedStage.source_bucket)
      .createSignedUrl(selectedStage.source_path, 300);
    sourceUrl = data?.signedUrl ?? null;
    if (error || !sourceUrl) {
      reportServerError("ops_import_source_preview_load_failed", error ?? new Error("Signed import source missing"));
    }
  }

  return (
    <main className="workspace wide-workspace">
      <header className="workspace-heading">
        <div>
          <p className="eyebrow">Importazioni</p>
          <h1>Dalla fonte alla bozza strutturata</h1>
          <p>CSV e XLSX sono deterministici; documenti e immagini passano da OpenAI. Ogni risultato resta in staging fino all’approvazione.</p>
        </div>
      </header>

      {params.provisioned && (
        <p className="form-success" role="status">
          {params.provisioned === "existing" ? "Provisioning già esistente recuperato senza duplicati." : "Ristorante creato atomicamente con sede, menu, tema, QR, owner e onboarding."}{" "}
          {params.invitation === "sent" ? "Invito proprietario inviato." : "Proprietario già registrato: membership collegata senza nuovo invito."}
          {params.qr && <> QR stabile: <a href={`/q/${params.qr}`}>/q/{params.qr}</a>.</>}
        </p>
      )}
      {params.uploaded && <p className="form-success" role="status">Materiale caricato e avviato con un solo job {params.job ? <code>{params.job.slice(0, 8)}</code> : null}.</p>}
      {params.saved && <p className="form-success" role="status">Correzioni staging salvate e revisionate contro lo schema.</p>}
      {params.approved && <p className="form-success" role="status">Import approvato: la bozza normalizzata e le righe di traduzione sono state scritte in un’unica transazione. Nulla è stato pubblicato.</p>}
      {params.lead_converted && <p className="form-success" role="status">Richiesta demo convertita: tenant e onboarding sono collegati. I dati del contatto non dovranno essere ricopiati.</p>}
      {params.retried && <p className="form-success" role="status">Nuovo tentativo avviato dal file privato già caricato. Non è stato creato alcun job duplicato.</p>}
      {params.error && <p className="form-error" role="alert">{errorMessages[params.error] ?? `Operazione non riuscita (${params.error}).`}{params.reference ? <small> Riferimento tecnico: <code>{params.reference}</code>.</small> : null}</p>}

      <div className="import-layout">
        <aside className="dashboard-panel case-list">
          <div className="panel-heading"><div><p className="eyebrow">Casi</p><h2>Seleziona cliente</h2><small>{cases.length ? `${firstVisibleCase}–${lastVisibleCase} di ${caseTotal}` : "Nessun caso disponibile"}</small></div><span className="count-badge">{caseTotal}</span></div>
          {selectedOutsidePage && selected ? (
            <div className="case-list-pinned">
              <span>Caso aperto da collegamento diretto</span>
              <Link className="active" href={importWorkspaceHref({ caseId: selected.id, page })}>
                <strong>{relationName(selected.location) || relationName(selected.organization) || "Ristorante"}</strong>
                <small>{selected.status}</small>
              </Link>
            </div>
          ) : null}
          {cases.map((entry) => (
            <Link className={entry.id === selected?.id ? "active" : ""} href={importWorkspaceHref({ caseId: entry.id, page })} key={entry.id}>
              <strong>{relationName(entry.location) || relationName(entry.organization) || "Ristorante"}</strong>
              <small>{entry.status}</small>
            </Link>
          ))}
          {caseTotalPages > 1 ? (
            <nav className="case-list-pagination" aria-label="Pagine dei casi importazione">
              {page > 1 ? <Link href={importWorkspaceHref({ page: page - 1 })}>← Più recenti</Link> : <span />}
              <span>Pagina {page} di {caseTotalPages}</span>
              {page < caseTotalPages ? <Link href={importWorkspaceHref({ page: page + 1 })}>Più vecchi →</Link> : <span />}
            </nav>
          ) : null}
        </aside>

        <section className="dashboard-panel import-workspace">
          {selected ? (
            <>
              <div className="panel-heading"><div><p className="eyebrow">Materiali</p><h2>{relationName(selected.location) || relationName(selected.organization) || "Ristorante"}</h2></div></div>
              <form action={uploadIntakeMaterial} className="upload-dropzone">
                <input type="hidden" name="case_id" value={selected.id} />
                <label>
                  <strong>Carica menu o documento</strong>
                  <span>PDF, CSV, XLSX, DOC/DOCX, JPG, PNG o WEBP · massimo 20 MB</span>
                  <input name="file" type="file" accept=".pdf,.csv,.xlsx,.doc,.docx,.jpg,.jpeg,.png,.webp" required />
                </label>
                <PendingSubmitButton className="button button-dark" pendingLabel="Caricamento e avvio…">Carica e analizza</PendingSubmitButton>
              </form>

              <AiJobMonitor activeJobs={activeJobCount} />
              <section className={`import-reliability ${failedJobCount || stalledJobCount ? "has-attention" : "is-healthy"}`} aria-label="Affidabilità delle elaborazioni">
                <span aria-hidden="true">{failedJobCount || stalledJobCount ? "!" : "✓"}</span>
                <div><strong>{failedJobCount || stalledJobCount ? "Serve attenzione" : "Elaborazioni sotto controllo"}</strong><p>{stalledJobCount ? `${stalledJobCount} elaborazioni non si aggiornano da almeno 15 minuti. ` : ""}{failedJobCount ? `${failedJobCount} tentativi non riusciti possono essere recuperati qui sotto.` : "Nessun errore o job fermo per questo ristorante."}</p></div>
              </section>
              <div className="job-list">
                <h3>Elaborazioni</h3>
                {caseJobs.map((job) => {
                  const jobError = formatJobError(job.error);
                  const stage = caseStages.find((entry) => entry.ai_job_id === job.id);
                  const attempt = Math.max(1, job.attempts ?? 0);
                  const stalled = isImportStalled(job.status, job.updated_at);
                  const retryable = ["failed", "cancelled"].includes(job.status) && attempt < MAX_IMPORT_ATTEMPTS && !stage;
                  return (
                    <article className={`import-job-card ${stalled ? "is-stalled" : ""} ${job.status === "failed" ? "is-failed" : ""}`} key={job.id}>
                      <span className={`status-dot status-${job.status}`} aria-hidden="true" />
                      <div className="import-job-main">
                        <strong>{jobSourceFilename(job.input)}</strong>
                        <small>{job.model} · tentativo {attempt} di {MAX_IMPORT_ATTEMPTS} · aggiornato {formatDateTime(job.updated_at)}</small>
                        {job.provider_file_released_at ? <span className="provider-release">✓ Copia temporanea OpenAI eliminata · {formatDateTime(job.provider_file_released_at)}</span> : null}
                        {stalled ? <em>Lo stato non si aggiorna da almeno 15 minuti: verifica il webhook prima di avviare altro lavoro.</em> : null}
                      </div>
                      <span className={`status-pill status-${job.status}`}>{jobStatusLabel[job.status] ?? job.status}</span>
                      <div className="import-job-actions">
                        {stage && <a className="button button-light" href={`/ops/import?case=${selected.id}&stage=${stage.id}`}>Revisiona</a>}
                        {retryable ? <form action={retryMenuImport}><input type="hidden" name="job_id" value={job.id} /><PendingSubmitButton className="button button-dark" pendingLabel="Avvio…">Riprova dal file salvato</PendingSubmitButton></form> : null}
                        {["failed", "cancelled"].includes(job.status) && !retryable ? <small>{stage ? "La bozza esistente va revisionata." : "Limite raggiunto: carica una nuova fonte."}</small> : null}
                      </div>
                      {jobError && <p className="import-job-error"><strong>{jobError.message}</strong>{jobError.reference ? <span>Riferimento <code>{jobError.reference}</code></span> : null}</p>}
                    </article>
                  );
                })}
                {!caseJobs.length ? <div className="empty-job-list"><p>Nessuna elaborazione ancora avviata.</p><span>Carica il primo materiale: la fonte resterà privata fino alla revisione.</span></div> : null}
              </div>
            </>
          ) : <div className="empty-state"><h2>Nessun caso disponibile</h2><p>Crea prima un ristorante pilota.</p></div>}
        </section>
      </div>

      {selectedStage && parsedStaging && reviewSummary && (
        <section className="dashboard-panel staging-review">
          <div className="panel-heading">
            <div><p className="eyebrow">Revisione import · rev. {selectedStage.revision}</p><h2>{parsedStaging.menu_name}</h2></div>
            <span className={`status-pill status-${selectedStage.status}`}>{selectedStage.status}</span>
          </div>

          <div className="staging-source-grid">
            <article>
              <p className="eyebrow">Fonte privata</p>
              <h3>{selectedStage.source_filename}</h3>
              <p>{selectedStage.source_mime_type} · parser {selectedStage.parser}</p>
              {sourceUrl && selectedStage.source_mime_type.startsWith("image/") && (
                // Signed URL expires after five minutes and the underlying intake object remains private.
                // eslint-disable-next-line @next/next/no-img-element
                <img className="staging-source-image" src={sourceUrl} alt={`Fonte ${selectedStage.source_filename}`} />
              )}
              {sourceUrl ? <a className="button button-light" href={sourceUrl} target="_blank" rel="noreferrer">Apri fonte per 5 minuti</a> : <p>Anteprima fonte non disponibile.</p>}
            </article>
            <article>
              <p className="eyebrow">Stato revisione</p>
              <strong>{reviewSummary.requiredDecisions === 0 ? "Pronto per l’approvazione" : `${reviewSummary.requiredDecisions} decisioni richieste`}</strong>
              <p>{reviewSummary.requiredDecisions === 0 ? "Non risultano dati obbligatori da completare." : "Trovi sotto soltanto le voci sulle quali devi scegliere."}</p>
              {issueSummary(parsedStaging.issues)}
            </article>
          </div>

          <div className="staging-categories">
            {parsedStaging.categories.map((category, categoryIndex) => (
              <article key={`${category.name}-${categoryIndex}`}>
                <header><div><span>{String(categoryIndex + 1).padStart(2, "0")}</span><h3>{category.name}</h3></div><small>{category.items.length} piatti</small></header>
                {category.description && <p>{category.description}</p>}
                {issueSummary(category.issues)}
                <div className="staging-items">
                  {category.items.map((item, itemIndex) => (
                    <div key={`${item.source_id ?? item.name}-${itemIndex}`}>
                      <header><strong>{item.name || "Nome mancante"}</strong><span>{item.price === null ? "Prezzo mancante" : formatCurrency(item.price, "it")}</span></header>
                      {item.description && <p>{item.description}</p>}
                      {item.ingredients && <small>Ingredienti: {item.ingredients}</small>}
                      <div className="staging-tags">
                        {item.allergens.filter((allergen) => allergen.confirmed === true).map((allergen) => (
                          <span key={allergen.code}>{allergen.origin === "document" ? "Dal documento" : "AI confermata"} · {allergen.name}</span>
                        ))}
                        {item.variants.map((variant) => <span key={variant.name}>{variant.name}: {variant.price_delta === null ? "delta mancante" : `+ ${formatCurrency(variant.price_delta, "it")}`}</span>)}
                        {item.available === false && <span className="uncertain">Non disponibile</span>}
                        {item.vegetarian === true && <span>Vegetariano</span>}
                        {item.vegan === true && <span>Vegano</span>}
                        {item.gluten_free === true && <span>Senza glutine</span>}
                      </div>
                      {issueSummary([
                        ...item.issues,
                        ...item.allergens.flatMap((allergen) => allergen.issues),
                        ...item.variants.flatMap((variant) => [
                          ...variant.issues,
                          ...variant.allergens.flatMap((allergen) => allergen.issues),
                        ]),
                      ])}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>

          {selectedStage.status === "review" ? (
            <>
              <StagingDecisionEditor
                staging={parsedStaging}
                stagingId={selectedStage.id}
                organizationId={selectedStage.organization_id}
                caseId={selectedStage.onboarding_case_id}
              />
              <div className="staging-actions">
                <details>
                  <summary>Modifica tecnica (solo emergenza)</summary>
                  <form action={saveMenuImportStaging} className="stack-form">
                    <input type="hidden" name="staging_id" value={selectedStage.id} />
                    <input type="hidden" name="organization_id" value={selectedStage.organization_id} />
                    <input type="hidden" name="case_id" value={selectedStage.onboarding_case_id} />
                    <label>JSON staging<textarea name="payload" rows={24} defaultValue={JSON.stringify(parsedStaging, null, 2)} spellCheck={false} /></label>
                    <p className="form-note">Usa questa sezione soltanto per casi non gestibili dai controlli guidati sopra.</p>
                    <PendingSubmitButton className="button button-light" pendingLabel="Salvataggio…">Salva correzioni</PendingSubmitButton>
                  </form>
                </details>
                <form action={approveMenuImport}>
                  <input type="hidden" name="staging_id" value={selectedStage.id} />
                  <input type="hidden" name="organization_id" value={selectedStage.organization_id} />
                  <input type="hidden" name="case_id" value={selectedStage.onboarding_case_id} />
                  <PendingSubmitButton className="button button-dark" pendingLabel="Scrittura nella bozza…" disabled={reviewSummary.requiredDecisions > 0 || !sourceUrl}>Approva e scrivi nella bozza</PendingSubmitButton>
                  {!sourceUrl ? <small>La fonte privata deve essere apribile prima dell’approvazione.</small> : null}
                </form>
              </div>
            </>
          ) : (
            <p className="form-success">Staging approvato. Riepilogo: {JSON.stringify(selectedStage.approval_summary)}.</p>
          )}
        </section>
      )}
    </main>
  );
}
