import type { PublicationDiff } from "@/lib/publication-diff";

const changeLabels = {
  added: "Aggiunta",
  removed: "Rimozione",
  updated: "Modifica",
};

export function PublicationChanges({ diff }: { diff: PublicationDiff }) {
  if (diff.firstPublication) {
    return (
      <section className="dashboard-panel publication-diff is-first" aria-labelledby="publication-diff-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Cosa andrà online</p>
            <h2 id="publication-diff-title">La prima versione completa</h2>
            <p>Stai creando il punto di partenza pubblico; i prossimi aggiornamenti verranno confrontati con questa versione.</p>
          </div>
          <span className="review-safety-badge">Prima pubblicazione</span>
        </div>
        <div className="publication-diff-metrics">
          <article><span>Categorie</span><strong>{diff.draftCategoryCount}</strong></article>
          <article><span>Piatti</span><strong>{diff.draftItemCount}</strong></article>
          <article><span>Sito e stile</span><strong>Inclusi</strong></article>
        </div>
      </section>
    );
  }

  return (
    <section className={`dashboard-panel publication-diff ${diff.hasChanges ? "has-changes" : "is-unchanged"}`} aria-labelledby="publication-diff-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Differenze dalla versione online</p>
          <h2 id="publication-diff-title">{diff.hasChanges ? `${diff.totalChanges} modifiche da pubblicare` : "Bozza e sito online coincidono"}</h2>
          <p>{diff.hasChanges ? "Controlla il riepilogo prima di sostituire la versione vista dagli ospiti." : "Non serve creare una versione identica. Modifica la bozza e torna qui quando hai qualcosa da pubblicare."}</p>
        </div>
        <span className="count-badge">{diff.totalChanges}</span>
      </div>
      <div className="publication-diff-metrics" aria-label="Riepilogo delle modifiche">
        <article><span>Nuovi piatti</span><strong>{diff.addedItems}</strong></article>
        <article><span>Piatti modificati</span><strong>{diff.updatedItems}</strong></article>
        <article><span>Piatti rimossi</span><strong>{diff.removedItems}</strong></article>
        <article><span>Categorie</span><strong>{diff.categoryChanges}</strong></article>
        <article><span>Sito, stile e lingue</span><strong>{diff.siteAndStyleChanges}</strong></article>
      </div>
      {diff.changes.length ? (
        <details className="publication-change-details" open={diff.changes.length <= 8}>
          <summary>Esamina il dettaglio delle modifiche</summary>
          <ol>
            {diff.changes.slice(0, 20).map((change, index) => (
              <li key={`${change.kind}-${change.label}-${index}`} className={`is-${change.kind}`}>
                <span>{changeLabels[change.kind]}</span>
                <div><strong>{change.label}</strong><small>{change.detail}</small></div>
              </li>
            ))}
          </ol>
          {diff.changes.length > 20 ? <p className="publication-change-overflow">Altre {diff.changes.length - 20} modifiche sono incluse nel conteggio. Usa l’anteprima per verificarle nel contesto.</p> : null}
        </details>
      ) : null}
    </section>
  );
}
