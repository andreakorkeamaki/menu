import { restorePublishedVersion } from "@/app/dashboard/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { formatDateTime } from "@/lib/format";
import { PUBLICATION_HISTORY_PAGE_SIZE, publicationHistoryHref } from "@/lib/publication-history-pagination";
import Link from "next/link";

export interface PublicationHistoryEntry {
  id: string;
  version: number;
  published_at: string;
  is_current: boolean;
  restored_from_id?: string | null;
}

export function PublicationHistory({
  entries,
  total = entries.length,
  page = 1,
  totalPages = 1,
}: {
  entries: PublicationHistoryEntry[];
  total?: number;
  page?: number;
  totalPages?: number;
}) {
  const firstVisible = entries.length ? (page - 1) * PUBLICATION_HISTORY_PAGE_SIZE + 1 : 0;
  const lastVisible = entries.length ? firstVisible + entries.length - 1 : 0;
  return (
    <section className="dashboard-panel publication-history" aria-labelledby="publication-history-title">
      <div className="panel-heading">
        <div><p className="eyebrow">Cronologia sicura</p><h2 id="publication-history-title">Versioni pubblicate</h2><p>Ogni pubblicazione resta immutabile. Ripristinare una versione ne crea una nuova, senza cancellare la storia.</p></div>
        <span className="count-badge">{total}</span>
      </div>
      {entries.length ? (
        <div className="publication-history-list">
          {entries.map((entry) => (
            <article className={entry.is_current ? "is-current" : ""} key={entry.id}>
              <div className="publication-version-mark"><strong>v{entry.version}</strong><span>{entry.is_current ? "Online ora" : entry.restored_from_id ? "Ripristino" : "Versione precedente"}</span></div>
              <time dateTime={entry.published_at}>{formatDateTime(entry.published_at)}</time>
              {entry.is_current ? <span className="publication-current-badge">Versione attiva</span> : (
                <details>
                  <summary>Ripristina questa versione</summary>
                  <div>
                    <p><strong>Portare online la v{entry.version}?</strong><span>Il contenuto attuale resterà nella cronologia e verrà creata una nuova versione attiva.</span></p>
                    <form action={restorePublishedVersion}>
                      <input type="hidden" name="publication_id" value={entry.id} />
                      <PendingSubmitButton className="button button-light" pendingLabel="Creazione versione…">Conferma ripristino</PendingSubmitButton>
                    </form>
                  </div>
                </details>
              )}
            </article>
          ))}
        </div>
      ) : <div className="publication-history-empty"><strong>Nessuna versione ancora pubblicata</strong><p>La prima pubblicazione apparirà qui e diventerà il punto di partenza della cronologia.</p></div>}
      {totalPages > 1 ? (
        <nav className="publication-history-pagination" aria-label="Pagine della cronologia">
          {page > 1 ? <Link href={publicationHistoryHref(page - 1)}>← Versioni più recenti</Link> : <span />}
          <span>{firstVisible}–{lastVisible} di {total}</span>
          {page < totalPages ? <Link href={publicationHistoryHref(page + 1)}>Versioni precedenti →</Link> : <span />}
        </nav>
      ) : null}
    </section>
  );
}
