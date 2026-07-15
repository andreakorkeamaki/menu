import { requireMembership } from "@/lib/auth";
import { LOCALE_LABELS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { Locale, TranslationRow } from "@/types/domain";

const statusLabel = { missing: "Mancante", machine_draft: "Da revisionare", approved: "Approvata", stale: "Da aggiornare", error: "Errore" };

export default async function TranslationsPage() {
  const { membership } = await requireMembership();
  const supabase = await createClient();
  const { data } = await supabase!.from("translations").select("*").eq("organization_id", membership.organization_id).order("status").limit(200);
  const rows = (data ?? []) as TranslationRow[];
  const byLocale = (["en", "fr", "de", "es"] as Locale[]).map((locale) => ({ locale, rows: rows.filter((row) => row.locale === locale) }));
  return (
    <main className="workspace">
      <header className="workspace-heading"><div><p className="eyebrow">Traduzioni</p><h1>Ogni lingua sotto controllo</h1><p>Le correzioni manuali restano protette; l’AI prepara soltanto nuove proposte.</p></div><a className="button button-dark" href="/api/openai/translations/start">Genera elementi obsoleti</a></header>
      <section className="language-summary">{byLocale.map(({ locale, rows: localeRows }) => <article key={locale}><span>{locale.toUpperCase()}</span><div><strong>{LOCALE_LABELS[locale]}</strong><small>{localeRows.filter((row) => row.status !== "approved").length} da rivedere</small></div></article>)}</section>
      <section className="dashboard-panel translation-table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Coda qualità</p><h2>Campi tradotti</h2></div><span className="count-badge">{rows.length}</span></div>
        {rows.length ? <div className="translation-list">{rows.map((row) => <article key={row.id}><span className={`status-dot status-${row.status}`} /><div><strong>{row.entity_type} · {row.field_name}</strong><p>{row.translated_text || "Nessuna traduzione disponibile"}</p></div><div><span>{row.locale.toUpperCase()}</span><small>{statusLabel[row.status]}</small><small>{row.origin === "manual" ? "Manuale" : "AI"}</small></div></article>)}</div> : <div className="empty-state"><h3>Nessuna traduzione in coda</h3><p>Le righe compariranno quando importi o modifichi un testo italiano.</p></div>}
      </section>
    </main>
  );
}
