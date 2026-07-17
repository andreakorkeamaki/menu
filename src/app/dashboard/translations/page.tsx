import { reviewTranslation } from "@/app/dashboard/actions";
import { BulkApproveTranslations } from "@/components/dashboard/bulk-approve-translations";
import {
  TranslationGenerationForm,
  TranslationGenerationProgress,
  TranslationGenerationProvider,
} from "@/components/dashboard/translation-generation";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import {
  loadTranslationSourceMap,
  translationSourceKey,
} from "@/lib/ai/translation-repository";
import { requireMembership } from "@/lib/auth";
import { LOCALE_LABELS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { failProtectedQuery, requireSuccessfulQueries } from "@/lib/supabase/query-health";
import { parseTranslationListParams, translationListHref } from "@/lib/translation-list";
import type { Locale, TranslationRow } from "@/types/domain";
import Link from "next/link";
import { redirect } from "next/navigation";

const statusLabel = {
  missing: "Mancante",
  machine_draft: "Da revisionare",
  approved: "Approvata",
  stale: "Da aggiornare",
  error: "Errore",
};
const targetLocales: Array<Exclude<Locale, "it">> = ["en", "fr", "de", "es"];

export default async function TranslationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    generated?: string;
    requested?: string;
    reviewed?: string;
    approved_all?: string;
    translation_error?: string;
    locale?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const filters = parseTranslationListParams(params);
  const pageSize = 100;
  const rangeStart = (filters.page - 1) * pageSize;
  const { membership } = await requireMembership();
  const supabase = await createClient();
  let translationQuery = supabase!.from("translations")
    .select("*", { count: "exact" })
    .eq("organization_id", membership.organization_id)
    .order("updated_at", { ascending: false })
    .order("id")
    .range(rangeStart, rangeStart + pageSize - 1);
  if (filters.locale) translationQuery = translationQuery.eq("locale", filters.locale);
  if (filters.status === "attention") translationQuery = translationQuery.neq("status", "approved");
  else if (filters.status !== "all") translationQuery = translationQuery.eq("status", filters.status);

  const [[translationResult, eligibleResult, readyDraftResult], localeSummaryResults] = await Promise.all([
    Promise.all([
      translationQuery,
      supabase!.from("translations").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).in("status", ["missing", "stale", "error"]).eq("origin", "machine"),
      supabase!.from("translations").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).eq("status", "machine_draft").not("translated_text", "is", null),
    ]),
    Promise.all(targetLocales.map(async (locale) => {
      const [pendingResult, localeEligibleResult] = await Promise.all([
        supabase!.from("translations").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).eq("locale", locale).neq("status", "approved"),
        supabase!.from("translations").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).eq("locale", locale).in("status", ["missing", "stale", "error"]).eq("origin", "machine"),
      ]);
      return { locale, pendingResult, eligibleResult: localeEligibleResult };
    })),
  ]);
  requireSuccessfulQueries(
    "dashboard_translations_load_failed",
    translationResult, eligibleResult, readyDraftResult,
    ...localeSummaryResults.flatMap((summary) => [summary.pendingResult, summary.eligibleResult]),
  );
  const rows = (translationResult.data ?? []) as TranslationRow[];
  const totalRows = translationResult.count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  if (filters.page > totalPages) {
    redirect(translationListHref({ ...filters, page: totalPages }));
  }
  const sourceMap = await loadTranslationSourceMap(
    supabase!,
    membership.organization_id,
    rows.map((row) => ({
      entityType: row.entity_type,
      entityId: row.entity_id,
      fieldName: row.field_name,
    })),
  ).catch((error) => failProtectedQuery("dashboard_translation_sources_load_failed", error));
  const byLocale = localeSummaryResults.map((summary) => ({
    locale: summary.locale,
    pending: summary.pendingResult.count ?? 0,
    eligible: summary.eligibleResult.count ?? 0,
  }));
  const totalEligible = eligibleResult.count ?? 0;
  const firstVisibleRow = totalRows ? rangeStart + 1 : 0;
  const lastVisibleRow = Math.min(rangeStart + rows.length, totalRows);

  return (
    <TranslationGenerationProvider>
      <main className="workspace wide-workspace">
        <header className="workspace-heading">
          <div><p className="eyebrow">Traduzioni</p><h1>Ogni lingua sotto controllo</h1><p>L’AI lavora solo su righe mancanti, obsolete o in errore; le correzioni manuali non vengono sovrascritte.</p></div>
          <TranslationGenerationForm
            count={totalEligible}
            label={`Generazione di ${totalEligible} traduzioni in corso`}
            buttonClassName="button button-dark"
          >
            Genera tutte le righe idonee
          </TranslationGenerationForm>
        </header>

        <TranslationGenerationProgress />
        {params.generated !== undefined && <p className="form-success" role="status">Generate {params.generated} bozze su {params.requested ?? "0"} richieste. Ora revisionale prima di pubblicare.</p>}
        {params.reviewed && <p className="form-success" role="status">Traduzione {params.reviewed === "approve" ? "approvata" : "salvata come correzione manuale"}.</p>}
        {params.approved_all !== undefined && <p className="form-success" role="status">Approvate {params.approved_all} traduzioni in un’unica operazione. Le righe non pronte sono rimaste in coda.</p>}
        {params.translation_error && <p className="form-error" role="alert">{params.translation_error === "partial" ? "Alcune lingue non sono state generate: le altre bozze sono state conservate." : params.translation_error === "use-post" ? "La generazione richiede una conferma POST dal pulsante della pagina." : params.translation_error === "bulk-approval" ? "L’approvazione multipla è stata annullata: nessuna bozza è stata approvata. Controlla che le traduzioni siano ancora aggiornate." : "Operazione traduzioni non riuscita."}</p>}

        <section className="language-summary">
          {byLocale.map(({ locale, pending, eligible }) => {
            return (
              <article key={locale}>
                <span>{locale.toUpperCase()}</span>
                <div><strong>{LOCALE_LABELS[locale]}</strong><small>{pending} da rivedere</small></div>
                <TranslationGenerationForm
                  count={eligible}
                  label={`Generazione ${LOCALE_LABELS[locale]} in corso`}
                  locale={locale}
                  buttonClassName="text-button"
                >
                  Genera {eligible}
                </TranslationGenerationForm>
              </article>
            );
          })}
        </section>

        <BulkApproveTranslations count={readyDraftResult.count ?? 0} />

        <details
          className="dashboard-panel translation-table-panel translation-details"
          open={Boolean(filters.locale || filters.status !== "attention" || filters.page > 1)}
        >
        <summary className="panel-heading"><div><p className="eyebrow">Dettaglio facoltativo</p><h2>Controlla o correggi le traduzioni</h2><small>{totalRows ? `${firstVisibleRow}–${lastVisibleRow} di ${totalRows} righe filtrate` : "Nessuna riga corrisponde ai filtri"}</small></div><span className="count-badge">{totalRows}</span></summary>
        <form action="/dashboard/translations" method="get" className="translation-filter-bar">
          <label>Lingua<select name="locale" defaultValue={filters.locale ?? ""}><option value="">Tutte</option>{targetLocales.map((locale) => <option value={locale} key={locale}>{LOCALE_LABELS[locale]}</option>)}</select></label>
          <label>Stato<select name="status" defaultValue={filters.status}><option value="attention">Da rivedere</option><option value="all">Tutte</option><option value="machine_draft">Bozze AI</option><option value="missing">Mancanti</option><option value="stale">Da aggiornare</option><option value="error">Errori</option><option value="approved">Approvate</option></select></label>
          <button className="button button-light">Applica filtri</button>
          {(filters.locale || filters.status !== "attention") ? <Link href="/dashboard/translations">Azzera</Link> : null}
        </form>
        {rows.length ? (
          <div className="translation-editor-list">
            {rows.map((row) => {
              const sourceText = sourceMap.get(translationSourceKey(row.entity_type, row.entity_id, row.field_name)) ?? "";
              const machineEligible = row.origin === "machine" && ["missing", "stale", "error"].includes(row.status);
              return (
                <article key={row.id}>
                  <header>
                    <div><span className={`status-dot status-${row.status}`} /><strong>{row.entity_type} · {row.field_name}</strong></div>
                    <div><span>{row.locale.toUpperCase()}</span><small>{statusLabel[row.status]}</small><small>{row.origin === "manual" ? "Manuale protetta" : "AI"}</small></div>
                  </header>
                  <div className="translation-source"><span>Italiano</span><p>{sourceText}</p></div>
                  <form action={reviewTranslation} className="stack-form">
                    <input type="hidden" name="translation_id" value={row.id} />
                    <label>Traduzione<textarea name="translated_text" rows={3} defaultValue={row.translated_text ?? ""} required /></label>
                    <div className="inline-actions">
                      <PendingSubmitButton className="button button-light" name="action" value="save" pendingLabel="Salvataggio…">Salva correzione manuale</PendingSubmitButton>
                      <PendingSubmitButton className="button button-dark" name="action" value="approve" pendingLabel="Approvazione…">Approva</PendingSubmitButton>
                    </div>
                  </form>
                  {machineEligible && (
                    <TranslationGenerationForm
                      count={1}
                      label={`Rigenerazione ${row.entity_type}.${row.field_name} in corso`}
                      translationId={row.id}
                      buttonClassName="text-button"
                    >
                      Rigenera solo questa riga
                    </TranslationGenerationForm>
                  )}
                </article>
              );
            })}
          </div>
        ) : <div className="empty-state"><h3>Nessuna traduzione con questi filtri</h3><p>Modifica lingua o stato; le righe vengono create automaticamente quando importi o aggiorni un testo italiano.</p></div>}
        {totalPages > 1 ? (
          <nav className="translation-pagination" aria-label="Pagine traduzioni">
            {filters.page > 1 ? <Link href={translationListHref({ ...filters, page: filters.page - 1 })}>← Precedenti</Link> : <span />}
            <span>Pagina {filters.page} di {totalPages}</span>
            {filters.page < totalPages ? <Link href={translationListHref({ ...filters, page: filters.page + 1 })}>Successive →</Link> : <span />}
          </nav>
        ) : null}
        </details>
      </main>
    </TranslationGenerationProvider>
  );
}
