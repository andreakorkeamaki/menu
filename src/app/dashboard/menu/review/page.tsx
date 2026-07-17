import Link from "next/link";
import { publishMenu } from "@/app/dashboard/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { PublicationHistory } from "@/components/dashboard/publication-history";
import { PublicationChanges } from "@/components/dashboard/publication-changes";
import { requireMembership } from "@/lib/auth";
import { buildDraftMenuPreview } from "@/lib/draft-menu-preview";
import { formatCurrency } from "@/lib/format";
import { buildPublicationDiff } from "@/lib/publication-diff";
import { PUBLICATION_HISTORY_PAGE_SIZE, parsePublicationHistoryPage, publicationHistoryHref } from "@/lib/publication-history-pagination";
import { buildPublicationReadiness } from "@/lib/publication-readiness";
import { parsePublicMenuSnapshot } from "@/lib/public-menu";
import { createClient } from "@/lib/supabase/server";
import { failProtectedQuery, requireSuccessfulQueries } from "@/lib/supabase/query-health";
import { redirect } from "next/navigation";

export default async function MenuPublicationReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ restored?: string; history_error?: string; history_page?: string }>;
}) {
  const params = await searchParams;
  const historyPage = parsePublicationHistoryPage(params.history_page);
  const { membership } = await requireMembership();
  const supabase = await createClient();
  const orgId = membership.organization_id;
  const [menuResult, categoryResult, itemResult, variantResult, allergenResult, itemAllergenResult, translationResult, pendingTranslationResult, locationResult, themeResult, pendingMediaResult] = await Promise.all([
    supabase!.from("menus").select("id,name,currency,source_locale,active_locales,current_publication_id,updated_at").eq("organization_id", orgId).limit(1).maybeSingle(),
    supabase!.from("menu_categories").select("id,slug,name_it,description_it,sort_order").eq("organization_id", orgId).order("sort_order"),
    supabase!.from("menu_items").select("id,category_id,name_it,description_it,ingredients_it,price,available,vegetarian,vegan,gluten_free,image_url,sort_order").eq("organization_id", orgId).order("sort_order"),
    supabase!.from("item_variants").select("id,item_id,name_it,price_delta,available,sort_order").eq("organization_id", orgId).order("sort_order"),
    supabase!.from("allergens").select("id,name_it").eq("organization_id", orgId),
    supabase!.from("item_allergens").select("item_id,allergen_id").eq("organization_id", orgId),
    supabase!.from("translations").select("entity_type,entity_id,field_name,locale,translated_text,status").eq("organization_id", orgId).eq("status", "approved"),
    supabase!.from("translations").select("id", { count: "exact", head: true }).eq("organization_id", orgId).in("status", ["missing", "machine_draft", "stale", "error"]),
    supabase!.from("locations").select("id,name,slug,status,tagline_it,description_it,address,city,phone,email,whatsapp_url,reservation_url,map_url,instagram_url,opening_hours,logo_url,cover_url").eq("organization_id", orgId).limit(1).maybeSingle(),
    supabase!.from("themes").select("theme_key,background,surface,text,muted,accent,accent_text,heading_font,body_font,radius").eq("organization_id", orgId).eq("is_active", true).limit(1).maybeSingle(),
    supabase!.from("media_assets").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("media_kind", "menu_item").eq("approval_status", "draft"),
  ]);
  requireSuccessfulQueries(
    "dashboard_publication_review_load_failed",
    menuResult, categoryResult, itemResult, variantResult, allergenResult,
    itemAllergenResult, translationResult, pendingTranslationResult, locationResult, themeResult,
    pendingMediaResult,
  );

  const menu = menuResult.data;
  const categories = categoryResult.data ?? [];
  const items = (itemResult.data ?? []).map((item) => ({ ...item, price: Number(item.price) }));
  const relations = itemAllergenResult.data ?? [];
  const translations = translationResult.data ?? [];
  const pendingTranslations = pendingTranslationResult.count ?? 0;
  const pendingMedia = pendingMediaResult.count ?? 0;
  const readiness = buildPublicationReadiness({
    categoryCount: categories.length,
    items: items.map((item) => ({
      available: item.available,
      description: item.description_it,
      ingredients: item.ingredients_it,
      allergenCount: relations.filter((relation) => relation.item_id === item.id).length,
    })),
    pendingTranslations,
    locationConfigured: Boolean(locationResult.data?.slug),
  });

  if (!menu) {
    return <main className="workspace"><section className="empty-state"><h1>Nessun menu da pubblicare</h1><p>Completa il provisioning iniziale prima di aprire la revisione.</p></section></main>;
  }
  if (!locationResult.data) {
    return <main className="workspace"><section className="empty-state"><h1>Sede non configurata</h1><p>Completa il provisioning della sede prima di pubblicare il menu.</p></section></main>;
  }
  const historyRangeStart = (historyPage - 1) * PUBLICATION_HISTORY_PAGE_SIZE;
  const [publicationResult, currentPublicationResult] = await Promise.all([
    supabase!.from("menu_publications")
      .select("id,menu_id,version,published_at,is_current,restored_from_id", { count: "exact" })
      .eq("organization_id", orgId)
      .eq("menu_id", menu.id)
      .order("version", { ascending: false })
      .range(historyRangeStart, historyRangeStart + PUBLICATION_HISTORY_PAGE_SIZE - 1),
    supabase!.from("menu_publications")
      .select("snapshot")
      .eq("id", menu.current_publication_id ?? "00000000-0000-0000-0000-000000000000")
      .eq("organization_id", orgId)
      .maybeSingle(),
  ]);
  requireSuccessfulQueries(
    "dashboard_publication_history_load_failed",
    publicationResult, currentPublicationResult,
  );
  const publicationTotal = publicationResult.count ?? publicationResult.data?.length ?? 0;
  const publicationTotalPages = Math.max(1, Math.ceil(publicationTotal / PUBLICATION_HISTORY_PAGE_SIZE));
  if (historyPage > publicationTotalPages) {
    redirect(publicationHistoryHref(publicationTotalPages));
  }
  if (menu.current_publication_id && !currentPublicationResult.data) {
    failProtectedQuery("dashboard_current_publication_missing", new Error("Current publication pointer could not be resolved."));
  }
  const currentSnapshot = currentPublicationResult.data
    ? parsePublicMenuSnapshot(currentPublicationResult.data.snapshot)
    : null;
  if (currentPublicationResult.data && !currentSnapshot) {
    failProtectedQuery("dashboard_current_publication_invalid", new Error("Current publication snapshot is invalid."));
  }
  const draftSnapshot = buildDraftMenuPreview({
    organizationId: orgId,
    menu,
    location: locationResult.data,
    theme: themeResult.data,
    categories,
    items,
    variants: variantResult.data ?? [],
    allergens: allergenResult.data ?? [],
    itemAllergens: relations,
    translations,
  });
  const publicationDiff = buildPublicationDiff(currentSnapshot, draftSnapshot);
  const publications = publicationResult.data ?? [];

  return (
    <main className="workspace wide-workspace publication-review-page">
      <header className="workspace-heading">
        <div>
          <p className="eyebrow">Revisione finale</p>
          <h1>Controlla ciò che andrà online</h1>
          <p>Questa è la bozza corrente. La versione pubblicata resta invariata finché non confermi l’ultimo passaggio.</p>
        </div>
        <div className="workspace-heading-actions">
          <Link className="button button-dark" href="/dashboard/menu/preview">Apri anteprima bozza ↗</Link>
          <Link className="button button-light" href="/dashboard/menu">← Torna alle modifiche</Link>
        </div>
      </header>
      {params.restored ? <p className="form-success" role="status">Versione ripristinata: è stata creata una nuova pubblicazione attiva e il QR stabile punta già al contenuto recuperato.</p> : null}
      {params.history_error ? <p className="form-error" role="alert">{params.history_error === "missing" ? "La versione scelta non esiste più o appartiene a un altro ristorante." : params.history_error === "forbidden" ? "Il tuo ruolo non consente di ripristinare questa versione." : params.history_error === "invalid" ? "La versione selezionata non è valida." : "Il ripristino non è riuscito. La versione online precedente è rimasta invariata."}</p> : null}

      <section className={`readiness-hero ${readiness.canPublish ? "is-ready" : "is-blocked"}`}>
        <div>
          <span aria-hidden="true">{readiness.canPublish ? "✓" : "!"}</span>
          <div>
            <p className="eyebrow">Stato bozza</p>
            <h2>{readiness.canPublish ? "Pronta per la pubblicazione" : `${readiness.blockers.length} controlli bloccano la pubblicazione`}</h2>
            <p>{readiness.canPublish ? "I controlli obbligatori sono superati. Leggi gli eventuali avvisi e conferma quando sei pronto." : "Risolvi i punti indicati: la versione online precedente è al sicuro."}</p>
          </div>
        </div>
        {locationResult.data?.slug && menu.current_publication_id ? <a className="text-link" href={`/r/${locationResult.data.slug}`} target="_blank">Apri la versione online ↗</a> : null}
      </section>

      <section className="review-metrics" aria-label="Riepilogo della bozza">
        <article><span>Categorie</span><strong>{categories.length}</strong></article>
        <article><span>Piatti disponibili</span><strong>{readiness.availableItemCount}</strong></article>
        <article><span>Lingue</span><strong>{menu.active_locales.length}</strong><small>{menu.active_locales.map((locale: string) => locale.toUpperCase()).join(" · ")}</small></article>
        <article><span>Traduzioni in coda</span><strong>{pendingTranslations}</strong></article>
      </section>

      {(readiness.blockers.length > 0 || readiness.warnings.length > 0 || pendingMedia > 0) ? (
        <section className="readiness-issues" aria-label="Controlli di pubblicazione">
          {readiness.blockers.map((issue) => (
            <article className="is-blocker" key={issue.code}>
              <span aria-hidden="true">!</span>
              <div><strong>{issue.title}</strong><p>{issue.detail}</p></div>
              <Link href={issue.href}>{issue.code === "translations" ? "Apri traduzioni" : "Correggi"} →</Link>
            </article>
          ))}
          {readiness.warnings.map((issue) => (
            <article className="is-warning" key={issue.code}>
              <span aria-hidden="true">i</span>
              <div><strong>{issue.title}</strong><p>{issue.detail}</p></div>
              <Link href={issue.href}>Rivedi →</Link>
            </article>
          ))}
          {pendingMedia > 0 ? (
            <article className="is-warning">
              <span aria-hidden="true">i</span>
              <div><strong>{pendingMedia === 1 ? "Una foto è ancora in revisione" : `${pendingMedia} foto sono ancora in revisione`}</strong><p>Puoi pubblicare ora, ma queste foto non entreranno nello snapshot finché un operatore non le approva. Dopo l’approvazione servirà una nuova pubblicazione.</p></div>
              <Link href="/dashboard/photos?filter=review">Controlla foto →</Link>
            </article>
          ) : null}
        </section>
      ) : null}

      <PublicationChanges diff={publicationDiff} />

      <section className="dashboard-panel review-menu-preview">
        <div className="panel-heading">
          <div><p className="eyebrow">Anteprima contenuti</p><h2>{menu.name}</h2></div>
          <span className="count-badge">{items.length}</span>
        </div>
        {categories.map((category) => {
          const categoryItems = items.filter((item) => item.category_id === category.id);
          return (
            <section className="review-category" key={category.id}>
              <header><h3>{category.name_it}</h3><span>{categoryItems.length} piatti</span></header>
              {categoryItems.map((item) => (
                <article className={`${!item.available ? "is-unavailable " : ""}${item.image_url ? "has-image" : ""}`} key={item.id}>
                  {item.image_url ? (
                    // Approved draft media only; publication still requires explicit confirmation.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image_url} alt="" width={120} height={90} loading="lazy" />
                  ) : null}
                  <div>
                    <strong>{item.name_it}</strong>
                    {item.description_it ? <p>{item.description_it}</p> : <p className="missing-copy">Descrizione non inserita</p>}
                    <div className="review-food-tags">
                      {item.vegetarian ? <span>Vegetariano</span> : null}
                      {item.vegan ? <span>Vegano</span> : null}
                      {item.gluten_free ? <span>Senza glutine</span> : null}
                      {relations.filter((relation) => relation.item_id === item.id).length > 0 ? <span>{relations.filter((relation) => relation.item_id === item.id).length} allergeni</span> : null}
                      {!item.available ? <span>Non disponibile</span> : null}
                    </div>
                  </div>
                  <strong>{formatCurrency(item.price)}</strong>
                </article>
              ))}
            </section>
          );
        })}
      </section>

      <PublicationHistory
        entries={publications}
        total={publicationTotal}
        page={historyPage}
        totalPages={publicationTotalPages}
      />

      <aside className="final-publish-panel">
        <div>
          <p className="eyebrow">Ultimo passaggio</p>
          <h2>{menu.current_publication_id ? publicationDiff.hasChanges ? "Sostituisci la versione online" : "Nessuna modifica da pubblicare" : "Pubblica la prima versione"}</h2>
          <p>{publicationDiff.hasChanges ? "La pubblicazione crea uno snapshot immutabile. Il QR stabile mostrerà la nuova versione; potrai continuare a modificare la bozza in sicurezza." : "La bozza coincide già con la versione online. Evitiamo di creare una copia identica nello storico."}</p>
        </div>
        <form action={publishMenu}>
          <input type="hidden" name="menu_id" value={menu.id} />
          <PendingSubmitButton className="button button-accent" pendingLabel="Creazione della versione…" disabled={!readiness.canPublish || !publicationDiff.hasChanges}>
            {!publicationDiff.hasChanges ? "Versione già aggiornata" : menu.current_publication_id ? "Conferma e sostituisci" : "Conferma e pubblica"}
          </PendingSubmitButton>
          {!readiness.canPublish ? <small>Completa prima i controlli bloccanti.</small> : !publicationDiff.hasChanges ? <small>Modifica la bozza per creare una nuova versione.</small> : null}
        </form>
      </aside>
    </main>
  );
}
