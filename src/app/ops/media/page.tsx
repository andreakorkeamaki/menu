import { reviewBrandMedia } from "@/app/ops/actions";
import { requireOperator } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { failProtectedQuery, requireSuccessfulQueries } from "@/lib/supabase/query-health";
import { MEDIA_REVIEW_PAGE_SIZE, mediaReviewHref, parseMediaReviewPage } from "@/lib/media-review-pagination";
import Link from "next/link";
import { redirect } from "next/navigation";

const errorCopy: Record<string, string> = {
  invalid: "La richiesta di revisione non è valida.",
  "not-reviewable": "L’immagine è già stata revisionata o non è più disponibile.",
  source: "Il file privato non è più disponibile.",
  "unsafe-source": "Il contenuto reale del file non corrisponde al formato dichiarato. Non è stato reso pubblico.",
  dimensions: "L’immagine è troppo piccola per una pubblicazione nitida. Chiedi un file con una risoluzione maggiore.",
  promote: "Non è stato possibile creare la copia pubblica.",
  review: "La decisione non è stata salvata. Nessuna nuova immagine è rimasta pubblica.",
  "generated-source": "La provenienza della bozza generata non è verificabile. L’immagine è rimasta privata.",
  "generated-stale": "Il testo del piatto è cambiato dopo la generazione. Rifiuta questa bozza e genera una nuova immagine aggiornata.",
};

export default async function MediaReviewPage({ searchParams }: { searchParams: Promise<{ reviewed?: string; error?: string; page?: string }> }) {
  const params = await searchParams;
  const page = parseMediaReviewPage(params.page);
  const rangeStart = (page - 1) * MEDIA_REVIEW_PAGE_SIZE;
  await requireOperator();
  const supabase = await createClient();
  const [mediaResult, logoResult, coverResult, dishResult] = await Promise.all([
    supabase!.from("media_assets")
      .select("id,organization_id,location_id,menu_item_id,ai_job_id,object_path,media_kind,mime_type,alt_text,created_at,organization:organizations(name),location:locations(name),item:menu_items(name_it,description_it,ingredients_it)", { count: "exact" })
      .eq("bucket_id", "intake")
      .eq("approval_status", "draft")
      .eq("is_public", false)
      .in("media_kind", ["logo", "cover", "menu_item"])
      .order("created_at", { ascending: true })
      .range(rangeStart, rangeStart + MEDIA_REVIEW_PAGE_SIZE - 1),
    supabase!.from("media_assets").select("id", { count: "exact", head: true }).eq("bucket_id", "intake").eq("approval_status", "draft").eq("is_public", false).eq("media_kind", "logo"),
    supabase!.from("media_assets").select("id", { count: "exact", head: true }).eq("bucket_id", "intake").eq("approval_status", "draft").eq("is_public", false).eq("media_kind", "cover"),
    supabase!.from("media_assets").select("id", { count: "exact", head: true }).eq("bucket_id", "intake").eq("approval_status", "draft").eq("is_public", false).eq("media_kind", "menu_item"),
  ]);
  requireSuccessfulQueries("ops_media_queue_load_failed", mediaResult, logoResult, coverResult, dishResult);
  const totalRows = mediaResult.count ?? mediaResult.data?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / MEDIA_REVIEW_PAGE_SIZE));
  if (page > totalPages) {
    redirect(mediaReviewHref(totalPages, {
      reviewed: params.reviewed === "approved" || params.reviewed === "rejected" ? params.reviewed : undefined,
      error: params.error,
    }));
  }
  const admin = createAdminClient();
  const rows = await Promise.all((mediaResult.data ?? []).map(async (asset) => {
    const { data: preview, error } = await admin.storage.from("intake").createSignedUrl(asset.object_path, 15 * 60);
    if (error || !preview?.signedUrl) {
      failProtectedQuery("ops_media_preview_load_failed", error ?? new Error("Signed media preview missing"));
    }
    return { ...asset, previewUrl: preview?.signedUrl ?? null };
  }));
  const logoCount = logoResult.count ?? 0;
  const coverCount = coverResult.count ?? 0;
  const dishCount = dishResult.count ?? 0;
  const firstVisible = rows.length ? rangeStart + 1 : 0;
  const lastVisible = rows.length ? rangeStart + rows.length : 0;

  return (
    <main className="workspace wide-workspace">
      <header className="workspace-heading"><div><p className="eyebrow">Controllo qualità</p><h1>Immagini prima della pubblicazione</h1><p>Verifica nitidezza, pertinenza e coerenza con il piatto. L’approvazione crea una copia WebP ottimizzata; ogni originale resta privato fino alla decisione.</p></div><span className="review-safety-badge">Intake privato</span></header>
      {params.reviewed && <p className="form-success" role="status">{params.reviewed === "approved" ? "Immagine approvata e collegata alla bozza del ristorante." : "Immagine rifiutata e rimossa dallo spazio privato."}</p>}
      {params.error && <p className="form-error" role="alert">{errorCopy[params.error] ?? "La revisione non è riuscita."}</p>}
      <section className="lead-metrics media-metrics" aria-label="Riepilogo revisione immagini">
        <article><span>In attesa</span><strong>{totalRows}</strong><small>File ancora privati</small></article>
        <article><span>Loghi</span><strong>{logoCount}</strong><small>Leggibilità e margini</small></article>
        <article><span>Copertine</span><strong>{coverCount}</strong><small>Qualità e pertinenza</small></article>
        <article><span>Piatti</span><strong>{dishCount}</strong><small>Nitidezza e fedeltà</small></article>
      </section>
      <section className="dashboard-panel media-review-panel">
        <div className="panel-heading"><div><p className="eyebrow">Coda di revisione</p><h2>Dal più vecchio al più recente</h2><small>{rows.length ? `${firstVisible}–${lastVisible} di ${totalRows} immagini` : "Nessuna immagine in attesa"}</small></div><span className="count-badge">{totalRows}</span></div>
        {rows.length ? (
          <div className="media-review-grid">
            {rows.map((asset) => (
              <article className="media-review-card" key={asset.id}>
                <div className={`media-review-image media-review-image-${asset.media_kind}`}>
                  {asset.previewUrl ? (
                    // Signed operator preview for a private intake object.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.previewUrl} alt={asset.alt_text || `Anteprima ${asset.media_kind === "logo" ? "logo" : asset.media_kind === "cover" ? "copertina" : "piatto"}`} />
                  ) : <span>Anteprima non disponibile</span>}
                  <strong>{asset.media_kind === "logo" ? "Logo" : asset.media_kind === "cover" ? "Copertina" : "Foto piatto"}</strong>
                  {asset.ai_job_id ? <span className="generated-media-badge">Generata con AI</span> : null}
                </div>
                <div className="media-review-body">
                  <div><p className="eyebrow">{asset.organization?.[0]?.name ?? "Organizzazione"}</p><h3>{asset.media_kind === "menu_item" ? asset.item?.[0]?.name_it ?? "Piatto" : asset.location?.[0]?.name ?? "Sede"}</h3></div>
                  {asset.ai_job_id ? (
                    <div className="generated-media-source">
                      <strong>Confronta con i dati del menu</strong>
                      <p>{asset.item?.[0]?.description_it || "Nessuna descrizione disponibile."}</p>
                      {asset.item?.[0]?.ingredients_it ? <small>Ingredienti: {asset.item[0].ingredients_it}</small> : null}
                    </div>
                  ) : <p>{asset.alt_text || "Nessun testo descrittivo fornito."}</p>}
                  <dl><div><dt>Formato</dt><dd>{asset.mime_type?.replace("image/", "").toUpperCase() ?? "—"}</dd></div><div><dt>Ricevuta</dt><dd>{formatDateTime(asset.created_at)}</dd></div></dl>
                  <div className="media-review-actions">
                    <form action={reviewBrandMedia}>
                      <input type="hidden" name="asset_id" value={asset.id} />
                      <input type="hidden" name="organization_id" value={asset.organization_id} />
                      <input type="hidden" name="action" value="approve" />
                      <input type="hidden" name="return_page" value={page} />
                      <button className="button button-dark">Approva</button>
                    </form>
                    <form action={reviewBrandMedia}>
                      <input type="hidden" name="asset_id" value={asset.id} />
                      <input type="hidden" name="organization_id" value={asset.organization_id} />
                      <input type="hidden" name="action" value="reject" />
                      <input type="hidden" name="return_page" value={page} />
                      <button className="button button-light danger-button">Rifiuta</button>
                    </form>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : <div className="empty-state"><h3>Tutto revisionato</h3><p>Le nuove immagini caricate dai ristoranti compariranno qui, ancora private.</p></div>}
        {totalPages > 1 ? (
          <nav className="media-review-pagination" aria-label="Pagine della coda immagini">
            {page > 1 ? <Link href={mediaReviewHref(page - 1)}>← Più vecchie</Link> : <span />}
            <span>Pagina {page} di {totalPages}</span>
            {page < totalPages ? <Link href={mediaReviewHref(page + 1)}>Più recenti →</Link> : <span />}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
