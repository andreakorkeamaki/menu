import {
  approveMenuImport,
  saveMenuImportStaging,
  uploadIntakeMaterial,
} from "@/app/ops/actions";
import { MenuImportStagingSchema, type ImportIssue } from "@/lib/ai/schemas";
import { requireOperator } from "@/lib/auth";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function relationName(value: { name?: string } | { name?: string }[] | null | undefined) {
  return (Array.isArray(value) ? value[0]?.name : value?.name) ?? "Ristorante";
}

function formatJobError(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Errore non dettagliato";
}

function issueSummary(issues: ImportIssue[]) {
  if (!issues.length) return null;
  return (
    <ul className="staging-issues">
      {issues.map((issue, index) => (
        <li className={`issue-${issue.severity}`} key={`${issue.path}-${issue.code}-${index}`}>
          <strong>{issue.severity === "error" ? "Bloccante" : issue.severity === "warning" ? "Da verificare" : "Nota"}</strong>
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
  processing: "L’elaborazione non è partita o non ha prodotto staging valido. Il file resta privato per il retry.",
  "invalid-json": "Il JSON corretto non è sintatticamente valido.",
  "invalid-staging-schema": "Lo staging non rispetta lo schema richiesto: controlla campi, null e tipi.",
  "save-staging": "La revisione non è stata salvata; potrebbe essere già approvata.",
  "review-required": "Risolvi gli issue bloccanti e tutti i prezzi mancanti prima dell’approvazione.",
  approval: "L’approvazione transazionale non è riuscita; la bozza non è stata modificata.",
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
    error?: string;
  }>;
}) {
  const params = await searchParams;
  await requireOperator();
  const supabase = await createClient();
  const [{ data: cases }, { data: jobs }, { data: stages }] = await Promise.all([
    supabase!.from("onboarding_cases").select("id,organization_id,status,contact_email,source_file_path,created_at,organization:organizations(name),location:locations(name)").order("created_at", { ascending: false }).limit(50),
    supabase!.from("ai_jobs").select("id,onboarding_case_id,status,model,error,created_at,completed_at").eq("kind", "menu_import").order("created_at", { ascending: false }).limit(100),
    supabase!.from("menu_import_staging").select("id,organization_id,onboarding_case_id,ai_job_id,source_bucket,source_path,source_filename,source_mime_type,parser,payload,status,revision,approval_summary,created_at,updated_at").order("created_at", { ascending: false }).limit(100),
  ]);
  const selected = (cases ?? []).find((entry) => entry.id === params.case) ?? (cases ?? [])[0];
  const caseStages = (stages ?? []).filter((entry) => entry.onboarding_case_id === selected?.id);
  const selectedStage = caseStages.find((entry) => entry.id === params.stage) ?? caseStages[0];
  const parsedStaging = selectedStage ? MenuImportStagingSchema.safeParse(selectedStage.payload) : null;
  let sourceUrl: string | null = null;
  if (selectedStage) {
    const { data } = await createAdminClient().storage
      .from(selectedStage.source_bucket)
      .createSignedUrl(selectedStage.source_path, 300);
    sourceUrl = data?.signedUrl ?? null;
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
      {params.error && <p className="form-error" role="alert">{errorMessages[params.error] ?? `Operazione non riuscita (${params.error}).`}</p>}

      <div className="import-layout">
        <aside className="dashboard-panel case-list">
          <div className="panel-heading"><div><p className="eyebrow">Casi</p><h2>Seleziona cliente</h2></div></div>
          {(cases ?? []).map((entry) => (
            <a className={entry.id === selected?.id ? "active" : ""} href={`/ops/import?case=${entry.id}`} key={entry.id}>
              <strong>{relationName(entry.location) || relationName(entry.organization)}</strong>
              <small>{entry.status}</small>
            </a>
          ))}
        </aside>

        <section className="dashboard-panel import-workspace">
          {selected ? (
            <>
              <div className="panel-heading"><div><p className="eyebrow">Materiali</p><h2>{relationName(selected.location) || relationName(selected.organization)}</h2></div></div>
              <form action={uploadIntakeMaterial} className="upload-dropzone">
                <input type="hidden" name="case_id" value={selected.id} />
                <label>
                  <strong>Carica menu o documento</strong>
                  <span>PDF, CSV, XLSX, DOC/DOCX, JPG, PNG o WEBP · massimo 20 MB</span>
                  <input name="file" type="file" accept=".pdf,.csv,.xlsx,.doc,.docx,.jpg,.jpeg,.png,.webp" required />
                </label>
                <button className="button button-dark">Carica e analizza</button>
              </form>

              <div className="job-list">
                <h3>Elaborazioni</h3>
                {(jobs ?? []).filter((job) => job.onboarding_case_id === selected.id).map((job) => {
                  const jobError = formatJobError(job.error);
                  const stage = caseStages.find((entry) => entry.ai_job_id === job.id);
                  return (
                    <article key={job.id}>
                      <span className={`status-dot status-${job.status}`} />
                      <div><strong>{job.model}</strong><small>{formatDateTime(job.created_at)}</small></div>
                      <span className="status-pill">{job.status}</span>
                      {stage && <a href={`/ops/import?case=${selected.id}&stage=${stage.id}`}>Revisiona →</a>}
                      {jobError && <p>{jobError}</p>}
                    </article>
                  );
                })}
              </div>
            </>
          ) : <div className="empty-state"><h2>Nessun caso disponibile</h2><p>Crea prima un ristorante pilota.</p></div>}
        </section>
      </div>

      {selectedStage && parsedStaging?.success && (
        <section className="dashboard-panel staging-review">
          <div className="panel-heading">
            <div><p className="eyebrow">Revisione import · rev. {selectedStage.revision}</p><h2>{parsedStaging.data.menu_name}</h2></div>
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
              <p className="eyebrow">Controlli globali</p>
              <strong>Confidenza {Math.round(parsedStaging.data.confidence.score * 100)}%</strong>
              {parsedStaging.data.confidence.notes && <p>{parsedStaging.data.confidence.notes}</p>}
              {issueSummary(parsedStaging.data.issues)}
            </article>
          </div>

          <div className="staging-categories">
            {parsedStaging.data.categories.map((category, categoryIndex) => (
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
                        {item.allergens.map((allergen) => <span key={allergen.code}>{allergen.name}</span>)}
                        {item.variants.map((variant) => <span key={variant.name}>{variant.name}: {variant.price_delta === null ? "delta mancante" : `+ ${formatCurrency(variant.price_delta, "it")}`}</span>)}
                        {[item.available, item.vegetarian, item.vegan, item.gluten_free].some((value) => value === null) && <span className="uncertain">Campi booleani non dichiarati</span>}
                        {item.confidence.score < 1 && <span className="uncertain">Confidenza {Math.round(item.confidence.score * 100)}%</span>}
                      </div>
                      {item.confidence.notes && <small>{item.confidence.notes}</small>}
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
            <div className="staging-actions">
              <details>
                <summary>Correggi staging strutturato</summary>
                <form action={saveMenuImportStaging} className="stack-form">
                  <input type="hidden" name="staging_id" value={selectedStage.id} />
                  <input type="hidden" name="organization_id" value={selectedStage.organization_id} />
                  <input type="hidden" name="case_id" value={selectedStage.onboarding_case_id} />
                  <label>JSON staging<textarea name="payload" rows={24} defaultValue={JSON.stringify(parsedStaging.data, null, 2)} spellCheck={false} /></label>
                  <p className="form-note">Non inventare dati: correggi soltanto ciò che la fonte consente di verificare. Gli errori bloccanti e i prezzi null devono essere risolti prima di approvare.</p>
                  <button className="button button-light">Salva correzioni</button>
                </form>
              </details>
              <form action={approveMenuImport}>
                <input type="hidden" name="staging_id" value={selectedStage.id} />
                <input type="hidden" name="organization_id" value={selectedStage.organization_id} />
                <input type="hidden" name="case_id" value={selectedStage.onboarding_case_id} />
                <button className="button button-dark">Approva e scrivi nella bozza</button>
              </form>
            </div>
          ) : (
            <p className="form-success">Staging approvato. Riepilogo: {JSON.stringify(selectedStage.approval_summary)}.</p>
          )}
        </section>
      )}
    </main>
  );
}
