import { reviewTranslation } from "@/app/dashboard/actions";
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
    translation_error?: string;
  }>;
}) {
  const params = await searchParams;
  const { membership } = await requireMembership();
  const supabase = await createClient();
  const { data } = await supabase!.from("translations").select("*").eq("organization_id", membership.organization_id).order("locale").order("status").limit(500);
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

  return (
    <main className="workspace wide-workspace">
      <header className="workspace-heading">
        <div><p className="eyebrow">Traduzioni</p><h1>Ogni lingua sotto controllo</h1><p>L’AI lavora solo su righe mancanti, obsolete o in errore; le correzioni manuali non vengono sovrascritte.</p></div>
        <form action="/api/openai/translations/start" method="post"><button className="button button-dark">Genera tutte le righe idonee</button></form>
      </header>

      {params.generated !== undefined && <p className="form-success" role="status">Generate {params.generated} bozze su {params.requested ?? "0"} richieste. Ora revisionale prima di pubblicare.</p>}
      {params.reviewed && <p className="form-success" role="status">Traduzione {params.reviewed === "approve" ? "approvata" : "salvata come correzione manuale"}.</p>}
      {params.translation_error && <p className="form-error" role="alert">{params.translation_error === "partial" ? "Alcune lingue non sono state generate: le altre bozze sono state conservate." : params.translation_error === "use-post" ? "La generazione richiede una conferma POST dal pulsante della pagina." : "Operazione traduzioni non riuscita."}</p>}

      <section className="language-summary">
        {byLocale.map(({ locale, rows: localeRows }) => {
          const eligible = localeRows.filter((row) => ["missing", "stale", "error"].includes(row.status) && row.origin === "machine").length;
          return (
            <article key={locale}>
              <span>{locale.toUpperCase()}</span>
              <div><strong>{LOCALE_LABELS[locale]}</strong><small>{localeRows.filter((row) => row.status !== "approved").length} da rivedere</small></div>
              <form action="/api/openai/translations/start" method="post">
                <input type="hidden" name="locale" value={locale} />
                <button className="text-button" disabled={!eligible}>Genera {eligible}</button>
              </form>
            </article>
          );
        })}
      </section>

      <section className="dashboard-panel translation-table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Coda qualità</p><h2>Campi tradotti</h2></div><span className="count-badge">{rows.length}</span></div>
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
                      <button className="button button-light" name="action" value="save">Salva correzione manuale</button>
                      <button className="button button-dark" name="action" value="approve">Approva</button>
                    </div>
                  </form>
                  {machineEligible && (
                    <form action="/api/openai/translations/start" method="post">
                      <input type="hidden" name="translation_id" value={row.id} />
                      <button className="text-button">Rigenera solo questa riga</button>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        ) : <div className="empty-state"><h3>Nessuna traduzione in coda</h3><p>Le righe vengono create automaticamente quando importi o modifichi un testo italiano.</p></div>}
      </section>
    </main>
  );
}
