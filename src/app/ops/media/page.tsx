import Link from "next/link";
import { redirect } from "next/navigation";
import { reviewBrandMedia } from "@/app/ops/actions";
import { MenuImageRegeneration } from "@/components/menu-image-regeneration";
import { BulkMediaApproval } from "@/components/ops/bulk-media-approval";
import { requireOperator } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import {
  MEDIA_REVIEW_PAGE_SIZE,
  mediaReviewHref,
  parseMediaReviewContext,
  parseMediaReviewPage,
} from "@/lib/media-review-pagination";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { failProtectedQuery, requireSuccessfulQueries } from "@/lib/supabase/query-health";

const errorCopy: Record<string, string> = {
  invalid: "La richiesta di revisione non è valida.",
  "invalid-context": "Il contesto ristorante/menu non è valido.",
  "not-reviewable": "L’immagine è già stata revisionata o non è più disponibile.",
  source: "Il file privato non è più disponibile.",
  "unsafe-source": "Il contenuto reale del file non corrisponde al formato dichiarato. Non è stato reso pubblico.",
  dimensions: "L’immagine è troppo piccola per una pubblicazione nitida. Chiedi un file con una risoluzione maggiore.",
  promote: "Non è stato possibile creare la copia pubblica.",
  review: "La decisione non è stata salvata. Nessuna nuova immagine è rimasta pubblica.",
  "generated-source": "La provenienza della bozza generata non è verificabile. L’immagine è rimasta privata.",
  "generated-stale": "Il testo del prodotto è cambiato dopo la generazione. Rigenera questa bozza prima dell’approvazione.",
};

type JobInput = {
  prompt?: unknown;
  visual_instructions?: unknown;
  generation_context?: unknown;
};

function generationContextLabel(context: unknown) {
  if (context === "style_sample") return "Campione stile";
  if (context === "catalog_regeneration") return "Rigenerazione catalogo";
  return "Generazione singola";
}

function dietaryLabels(item?: {
  vegetarian: boolean;
  vegan: boolean;
  gluten_free: boolean;
}) {
  return [
    item?.vegan ? "Vegano" : item?.vegetarian ? "Vegetariano" : null,
    item?.gluten_free ? "Senza glutine" : null,
  ].filter((label): label is string => Boolean(label));
}

export default async function MediaReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ reviewed?: string; error?: string; page?: string; context?: string }>;
}) {
  const params = await searchParams;
  const page = parseMediaReviewPage(params.page);
  const requestedContext = parseMediaReviewContext(params.context);
  const rangeStart = (page - 1) * MEDIA_REVIEW_PAGE_SIZE;
  await requireOperator();
  const supabase = await createClient();

  const [organizationResult, locationResult, menuResult, logoResult, coverResult, dishResult] = await Promise.all([
    supabase!.from("organizations").select("id,name").order("name"),
    supabase!.from("locations").select("id,organization_id,name").order("name"),
    supabase!.from("menus").select("id,organization_id,location_id,name").order("name"),
    supabase!.from("media_assets").select("id", { count: "exact", head: true }).eq("bucket_id", "intake").eq("approval_status", "draft").eq("is_public", false).eq("media_kind", "logo"),
    supabase!.from("media_assets").select("id", { count: "exact", head: true }).eq("bucket_id", "intake").eq("approval_status", "draft").eq("is_public", false).eq("media_kind", "cover"),
    supabase!.from("media_assets").select("id", { count: "exact", head: true }).eq("bucket_id", "intake").eq("approval_status", "draft").eq("is_public", false).eq("media_kind", "menu_item").is("superseded_at", null),
  ]);
  requireSuccessfulQueries(
    "ops_media_context_load_failed",
    organizationResult, locationResult, menuResult, logoResult, coverResult, dishResult,
  );

  const organizations = organizationResult.data ?? [];
  const locations = locationResult.data ?? [];
  const menus = menuResult.data ?? [];
  const organizationById = new Map(organizations.map((entry) => [entry.id, entry]));
  const locationById = new Map(locations.map((entry) => [entry.id, entry]));
  const activeContext = requestedContext && menus.some((menu) => (
    menu.id === requestedContext.menuId
    && menu.organization_id === requestedContext.organizationId
  )) ? requestedContext : null;
  if (requestedContext && !activeContext) redirect(mediaReviewHref(1, { error: "invalid-context" }));

  let mediaQuery = supabase!.from("media_assets")
    .select("id,organization_id,location_id,menu_id,menu_item_id,ai_job_id,object_path,media_kind,mime_type,alt_text,created_at", { count: "exact" })
    .eq("bucket_id", "intake")
    .eq("approval_status", "draft")
    .eq("is_public", false)
    .is("superseded_at", null)
    .in("media_kind", ["logo", "cover", "menu_item"]);
  if (activeContext) {
    mediaQuery = mediaQuery
      .eq("organization_id", activeContext.organizationId)
      .eq("menu_id", activeContext.menuId)
      .eq("media_kind", "menu_item");
  }
  const mediaResult = await mediaQuery
    .order("created_at", { ascending: true })
    .range(rangeStart, rangeStart + MEDIA_REVIEW_PAGE_SIZE - 1);
  requireSuccessfulQueries("ops_media_queue_load_failed", mediaResult);

  const assets = mediaResult.data ?? [];
  const itemIds = assets.flatMap((asset) => asset.menu_item_id ? [asset.menu_item_id] : []);
  const jobIds = assets.flatMap((asset) => asset.ai_job_id ? [asset.ai_job_id] : []);
  const [itemResult, jobResult] = await Promise.all([
    itemIds.length
      ? supabase!.from("menu_items").select("id,organization_id,category_id,name_it,description_it,ingredients_it,vegetarian,vegan,gluten_free").in("id", itemIds)
      : Promise.resolve({ data: [], error: null }),
    jobIds.length
      ? supabase!.from("ai_jobs").select("id,organization_id,prompt_version,input").in("id", jobIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  requireSuccessfulQueries("ops_media_source_load_failed", itemResult, jobResult);
  const items = itemResult.data ?? [];
  const categoryIds = items.map((item) => item.category_id);
  const categoryResult = categoryIds.length
    ? await supabase!.from("menu_categories").select("id,organization_id,menu_id,name_it").in("id", categoryIds)
    : { data: [], error: null };
  requireSuccessfulQueries("ops_media_category_load_failed", categoryResult);

  const itemById = new Map(items.map((item) => [item.id, item]));
  const categoryById = new Map((categoryResult.data ?? []).map((category) => [category.id, category]));
  const jobById = new Map((jobResult.data ?? []).map((job) => [job.id, job]));
  const menuById = new Map(menus.map((menu) => [menu.id, menu]));
  const admin = createAdminClient();
  const rows = await Promise.all(assets.map(async (asset) => {
    const { data: preview, error } = await admin.storage.from("intake").createSignedUrl(asset.object_path, 15 * 60);
    if (error || !preview?.signedUrl) {
      failProtectedQuery("ops_media_preview_load_failed", error ?? new Error("Signed media preview missing"));
    }
    return { ...asset, previewUrl: preview?.signedUrl ?? null };
  }));

  const totalRows = mediaResult.count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / MEDIA_REVIEW_PAGE_SIZE));
  if (page > totalPages) {
    redirect(mediaReviewHref(totalPages, {
      reviewed: params.reviewed === "approved" || params.reviewed === "rejected" ? params.reviewed : undefined,
      error: params.error,
      context: activeContext?.value,
    }));
  }
  const selectedMenu = activeContext ? menuById.get(activeContext.menuId) : null;
  const selectedOrganization = activeContext ? organizationById.get(activeContext.organizationId) : null;
  const selectedLocation = selectedMenu ? locationById.get(selectedMenu.location_id) : null;
  const contextLabel = selectedMenu
    ? `${selectedLocation?.name ?? selectedOrganization?.name ?? "Ristorante"} · ${selectedMenu.name}`
    : null;

  let bulkAssets: Array<{ id: string; name: string }> = [];
  if (activeContext) {
    const { data, error } = await supabase!.from("media_assets")
      .select("id")
      .eq("organization_id", activeContext.organizationId)
      .eq("menu_id", activeContext.menuId)
      .eq("media_kind", "menu_item")
      .eq("bucket_id", "intake")
      .eq("approval_status", "draft")
      .eq("is_public", false)
      .is("superseded_at", null)
      .order("created_at", { ascending: true });
    if (error) failProtectedQuery("ops_media_bulk_context_load_failed", error);
    bulkAssets = (data ?? []).map((asset) => ({ id: asset.id, name: "Foto prodotto" }));
  }

  const logoCount = logoResult.count ?? 0;
  const coverCount = coverResult.count ?? 0;
  const dishCount = dishResult.count ?? 0;
  const globalPendingCount = logoCount + coverCount + dishCount;
  const firstVisible = rows.length ? rangeStart + 1 : 0;
  const lastVisible = rows.length ? rangeStart + rows.length : 0;

  return (
    <main className="workspace wide-workspace">
      <header className="workspace-heading"><div><p className="eyebrow">Controllo qualità</p><h1>Immagini prima della pubblicazione</h1><p>La coda resta globale. Seleziona un ristorante e un menu per isolare il contesto e abilitare l’approvazione massiva sicura.</p></div><span className="review-safety-badge">Intake privato</span></header>
      {params.reviewed && <p className="form-success" role="status">{params.reviewed === "approved" ? "Immagine approvata e collegata alla bozza del ristorante." : "Immagine rifiutata e rimossa dallo spazio privato."}</p>}
      {params.error && <p className="form-error" role="alert">{errorCopy[params.error] ?? "La revisione non è riuscita."}</p>}

      <form className="media-context-filter" method="get">
        <label htmlFor="media-context"><strong>Contesto di revisione</strong><span>La vista globale non offre “Approva tutto”.</span></label>
        <select id="media-context" name="context" defaultValue={activeContext?.value ?? ""}>
          <option value="">Tutti i ristoranti · coda globale</option>
          {menus.map((menu) => {
            const organization = organizationById.get(menu.organization_id);
            const location = locationById.get(menu.location_id);
            return <option value={`${menu.organization_id}:${menu.id}`} key={menu.id}>{location?.name ?? organization?.name ?? "Ristorante"} · {menu.name}</option>;
          })}
        </select>
        <button className="button button-light">Apri contesto</button>
      </form>

      <section className="lead-metrics media-metrics" aria-label="Riepilogo revisione immagini">
        <article><span>In attesa</span><strong>{globalPendingCount}</strong><small>File globali privati</small></article>
        <article><span>Loghi</span><strong>{logoCount}</strong><small>Leggibilità e margini</small></article>
        <article><span>Copertine</span><strong>{coverCount}</strong><small>Qualità e pertinenza</small></article>
        <article><span>Prodotti</span><strong>{dishCount}</strong><small>Nitidezza e fedeltà</small></article>
      </section>

      {activeContext && contextLabel ? (
        <BulkMediaApproval
          assets={bulkAssets}
          organizationId={activeContext.organizationId}
          menuId={activeContext.menuId}
          contextLabel={contextLabel}
        />
      ) : null}

      <section className="dashboard-panel media-review-panel">
        <div className="panel-heading"><div><p className="eyebrow">{contextLabel ? "Coda del menu" : "Coda globale"}</p><h2>{contextLabel ?? "Dal più vecchio al più recente"}</h2><small>{rows.length ? `${firstVisible}–${lastVisible} di ${totalRows} immagini` : "Nessuna immagine in attesa"}</small></div><span className="count-badge">{totalRows}</span></div>
        {rows.length ? (
          <div className="media-review-grid">
            {rows.map((asset) => {
              const item = asset.menu_item_id ? itemById.get(asset.menu_item_id) : undefined;
              const category = item ? categoryById.get(item.category_id) : undefined;
              const menu = asset.menu_id ? menuById.get(asset.menu_id) : undefined;
              const organization = organizationById.get(asset.organization_id);
              const location = menu ? locationById.get(menu.location_id) : asset.location_id ? locationById.get(asset.location_id) : undefined;
              const job = asset.ai_job_id ? jobById.get(asset.ai_job_id) : undefined;
              const jobInput = (job?.input && typeof job.input === "object" ? job.input : {}) as JobInput;
              const labels = dietaryLabels(item);
              return (
                <article className="media-review-card" key={asset.id}>
                  <div className={`media-review-image media-review-image-${asset.media_kind}`}>
                    {asset.previewUrl ? (
                      // Signed operator preview for a private intake object.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={asset.previewUrl} alt={asset.alt_text || `Anteprima ${asset.media_kind === "logo" ? "logo" : asset.media_kind === "cover" ? "copertina" : "prodotto"}`} />
                    ) : <span>Anteprima non disponibile</span>}
                    <strong>{asset.media_kind === "logo" ? "Logo" : asset.media_kind === "cover" ? "Copertina" : "Foto prodotto"}</strong>
                    {asset.ai_job_id ? <span className="generated-media-badge">Generata con AI</span> : null}
                  </div>
                  <div className="media-review-body">
                    <div>
                      <p className="eyebrow">{location?.name ?? organization?.name ?? "Ristorante"}{menu ? ` · ${menu.name}` : ""}</p>
                      <h3>{asset.media_kind === "menu_item" ? item?.name_it ?? "Prodotto non disponibile" : location?.name ?? organization?.name ?? "Sede"}</h3>
                    </div>
                    {item ? (
                      <div className="generated-media-source media-product-source">
                        <dl>
                          <div><dt>Categoria</dt><dd>{category?.name_it ?? "Non disponibile"}</dd></div>
                          <div><dt>Descrizione</dt><dd>{item.description_it || "Nessuna descrizione"}</dd></div>
                          <div><dt>Ingredienti</dt><dd>{item.ingredients_it || "Non indicati"}</dd></div>
                          <div><dt>Indicazioni</dt><dd>{labels.length ? labels.join(" · ") : "Nessuna indicazione dietetica"}</dd></div>
                        </dl>
                      </div>
                    ) : <p>{asset.alt_text || "Nessun testo descrittivo fornito."}</p>}
                    {job && item && asset.menu_id ? (
                      <div className="generated-media-instructions">
                        <div><strong>Istruzioni visive usate</strong><span>{typeof jobInput.visual_instructions === "string" && jobInput.visual_instructions ? jobInput.visual_instructions : "Prompt contestuale v2 senza nota aggiuntiva"}</span><small>{job.prompt_version} · {generationContextLabel(jobInput.generation_context)}</small></div>
                        {typeof jobInput.prompt === "string" ? <details><summary>Vedi prompt completo</summary><pre>{jobInput.prompt}</pre></details> : null}
                        <MenuImageRegeneration
                          itemId={item.id}
                          itemName={item.name_it}
                          replaceAssetId={asset.id}
                          organizationId={asset.organization_id}
                          menuId={asset.menu_id}
                        />
                      </div>
                    ) : null}
                    <dl className="media-file-meta"><div><dt>Formato</dt><dd>{asset.mime_type?.replace("image/", "").toUpperCase() ?? "—"}</dd></div><div><dt>Ricevuta</dt><dd>{formatDateTime(asset.created_at)}</dd></div></dl>
                    <div className="media-review-actions">
                      <form action={reviewBrandMedia}>
                        <input type="hidden" name="asset_id" value={asset.id} />
                        <input type="hidden" name="organization_id" value={asset.organization_id} />
                        <input type="hidden" name="action" value="approve" />
                        <input type="hidden" name="return_page" value={page} />
                        {activeContext ? <input type="hidden" name="return_context" value={activeContext.value} /> : null}
                        <button className="button button-dark">Approva</button>
                      </form>
                      <form action={reviewBrandMedia}>
                        <input type="hidden" name="asset_id" value={asset.id} />
                        <input type="hidden" name="organization_id" value={asset.organization_id} />
                        <input type="hidden" name="action" value="reject" />
                        <input type="hidden" name="return_page" value={page} />
                        {activeContext ? <input type="hidden" name="return_context" value={activeContext.value} /> : null}
                        <button className="button button-light danger-button">Rifiuta</button>
                      </form>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : <div className="empty-state"><h3>Tutto revisionato</h3><p>Le nuove immagini caricate dai ristoranti compariranno qui, ancora private.</p></div>}
        {totalPages > 1 ? (
          <nav className="media-review-pagination" aria-label="Pagine della coda immagini">
            {page > 1 ? <Link href={mediaReviewHref(page - 1, { context: activeContext?.value })}>← Più vecchie</Link> : <span />}
            <span>Pagina {page} di {totalPages}</span>
            {page < totalPages ? <Link href={mediaReviewHref(page + 1, { context: activeContext?.value })}>Più recenti →</Link> : <span />}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
