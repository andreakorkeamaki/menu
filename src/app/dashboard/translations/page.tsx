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
import type { Locale, TranslationRow } from "@/types/domain";

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
  }>;
}) {
  const params = await searchParams;
  const { membership } = await requireMembership();
  const supabase = await createClient();
  const [{ data }, { count: eligibleCount }, { count: readyDraftCount }] = await Promise.all([
    supabase!.from("translations").select("*").eq("organization_id", membership.organization_id).order("locale").order("status").limit(500),
    supabase!.from("translations").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).in("status", ["missing", "stale", "error"]).eq("origin", "machine"),
    supabase!.from("translations").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).eq("status", "machine_draft").not("translated_text", "is", null),
  ]);
  const rows = (data ?? []) as TranslationRow[];
  const sourceMap = await loadTranslationSourceMap(
    supabase!,
    membership.organization_id,
    rows.map((row) => ({
      entityType: row.entity_type,
      entityId: row.entity_id,
      fieldName: row.field_name,
    })),
  );
  const byLocale = targetLocales.map((locale) => ({
    locale,
    rows: rows.filter((row) => row.locale === locale),
  }));
  const visibleEligible = rows.filter(
    (row) =>
      ["missing", "stale", "error"].includes(row.status) &&
      row.origin === "machine",
  ).length;
  const totalEligible = eligibleCount ?? visibleEligible;

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
          {byLocale.map(({ locale, rows: localeRows }) => {
            const eligible = localeRows.filter((row) => ["missing", "stale", "error"].includes(row.status) && row.origin === "machine").length;
            return (
              <article key={locale}>
                <span>{locale.toUpperCase()}</span>
                <div><strong>{LOCALE_LABELS[locale]}</strong><small>{localeRows.filter((row) => row.status !== "approved").length} da rivedere</small></div>
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

        <BulkApproveTranslations count={readyDraftCount ?? 0} />

        <details className="dashboard-panel translation-table-panel translation-details">
        <summary className="panel-heading"><div><p className="eyebrow">Dettaglio facoltativo</p><h2>Controlla o correggi le traduzioni</h2><small>Apri soltanto se vuoi leggere le singole righe.</small></div><span className="count-badge">{rows.length}</span></summary>
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
        ) : <div className="empty-state"><h3>Nessuna traduzione in coda</h3><p>Le righe vengono create automaticamente quando importi o modifichi un testo italiano.</p></div>}
        </details>
      </main>
    </TranslationGenerationProvider>
  );
}
