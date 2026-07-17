import type { CSSProperties } from "react";
import Link from "next/link";
import { requireMembership } from "@/lib/auth";
import { buildDashboardGuide } from "@/lib/dashboard-guide";
import { formatDateTime } from "@/lib/format";
import { buildPublicationReadiness } from "@/lib/publication-readiness";
import { createClient } from "@/lib/supabase/server";
import { requireSuccessfulQueries } from "@/lib/supabase/query-health";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ workspace_error?: string; welcome?: string; password_updated?: string }> }) {
  const params = await searchParams;
  const { membership, profile } = await requireMembership();
  const supabase = await createClient();
  const orgId = membership.organization_id;
  const [locationResult, menuResult, categoryResult, itemResult, itemAllergenResult, staleResult, qrResult, brandMediaResult, menuMediaResult] = await Promise.all([
    supabase!.from("locations").select("id,name,slug,status").eq("organization_id", orgId).limit(1).maybeSingle(),
    supabase!.from("menus").select("id,name,current_publication_id,updated_at").eq("organization_id", orgId).limit(1).maybeSingle(),
    supabase!.from("menu_categories").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    supabase!.from("menu_items").select("id,available,description_it,ingredients_it").eq("organization_id", orgId),
    supabase!.from("item_allergens").select("item_id").eq("organization_id", orgId),
    supabase!.from("translations").select("id", { count: "exact", head: true }).eq("organization_id", orgId).in("status", ["missing", "machine_draft", "stale", "error"]),
    supabase!.from("qr_codes").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("is_active", true),
    supabase!.from("media_assets").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("approval_status", "draft").in("media_kind", ["logo", "cover"]),
    supabase!.from("media_assets").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("approval_status", "draft").eq("media_kind", "menu_item"),
  ]);
  requireSuccessfulQueries(
    "dashboard_overview_load_failed",
    locationResult, menuResult, categoryResult, itemResult,
    itemAllergenResult, staleResult, qrResult, brandMediaResult, menuMediaResult,
  );
  const location = locationResult.data;
  const menu = menuResult.data;
  const pendingBrandMedia = brandMediaResult.count ?? 0;
  const pendingMenuMedia = menuMediaResult.count ?? 0;
  const relations = itemAllergenResult.data ?? [];
  const readiness = buildPublicationReadiness({
    categoryCount: categoryResult.count ?? 0,
    items: (itemResult.data ?? []).map((item) => ({
      available: item.available,
      description: item.description_it,
      ingredients: item.ingredients_it,
      allergenCount: relations.filter((relation) => relation.item_id === item.id).length,
    })),
    pendingTranslations: staleResult.count ?? 0,
    locationConfigured: Boolean(location?.name && location?.slug),
  });
  const guide = buildDashboardGuide({
    blockerCodes: readiness.blockers.map((issue) => issue.code),
    published: Boolean(menu?.current_publication_id),
  });
  const guideStyle = { "--guide-progress": `${guide.percent}%` } as CSSProperties;

  return (
    <main className="workspace">
      <header className="workspace-heading">
        <div><p className="eyebrow">Buongiorno, {profile.full_name}</p><h1>{location?.name ?? "Il tuo ristorante"}</h1><p>{guide.complete ? "Il menu è online. Le nuove modifiche restano in bozza finché non scegli di pubblicarle." : "Segui il prossimo passaggio: la versione online resta sempre protetta."}</p></div>
        {location?.slug && menu?.current_publication_id ? <Link className="button button-light" href={`/r/${location.slug}`} target="_blank">Apri il sito ↗</Link> : null}
      </header>
      {params.workspace_error && <p className="form-error" role="alert">Il ristorante selezionato non appartiene al tuo account. La selezione precedente è rimasta invariata.</p>}
      {params.password_updated && <p className="form-success" role="status">Password aggiornata. Il tuo account è protetto con la nuova credenziale.</p>}
      {params.welcome && (
        <section className="activation-welcome" role="status">
          <span aria-hidden="true">✓</span>
          <div><p className="eyebrow">Accesso completato</p><h2>Benvenuto, {profile.full_name}.</h2><p>Il tuo ristorante è pronto per essere configurato. Ti mostreremo un passaggio alla volta e nulla andrà online senza una conferma esplicita.</p></div>
          <Link className="button button-dark" href={guide.next.href}>{guide.actionLabel} →</Link>
        </section>
      )}

      <section className={`dashboard-guide ${guide.complete ? "is-complete" : ""}`}>
        <div className="dashboard-guide-intro">
          <div className="guide-progress" style={guideStyle} aria-label={`${guide.percent}% del percorso completato`}><span>{guide.percent}%</span></div>
          <div><p className="eyebrow">{guide.complete ? "Operatività" : "Prossimo passaggio"}</p><h2>{guide.complete ? "Tutto sotto controllo" : guide.actionLabel}</h2><p>{guide.complete ? "Puoi aggiornare contenuti e preparare la prossima versione senza toccare quella online." : `${readiness.blockers.length} controlli separano questa bozza dalla pubblicazione. Risolviamoli uno alla volta.`}</p></div>
        </div>
        <ol className="dashboard-guide-steps">
          {guide.steps.map((step, index) => (
            <li className={step.complete ? "is-complete" : step.id === guide.next.id ? "is-current" : ""} key={step.id}>
              <span aria-hidden="true">{step.complete ? "✓" : index + 1}</span>
              <Link href={step.href}>{step.label}</Link>
              <small>{step.complete ? "Completo" : step.id === guide.next.id ? "Da fare ora" : "In attesa"}</small>
            </li>
          ))}
        </ol>
        <Link className="button button-accent" href={guide.next.href}>{guide.actionLabel} →</Link>
      </section>

      <section className="metric-grid">
        <article className="metric-card metric-primary"><span>Stato menu</span><strong>{menu?.current_publication_id ? "Pubblicato" : readiness.canPublish ? "Pronto" : "In bozza"}</strong><p>{menu?.updated_at ? `Ultima modifica ${formatDateTime(menu.updated_at)}` : "Completa il primo menu"}</p></article>
        <article className="metric-card"><span>Traduzioni da rivedere</span><strong>{staleResult.count ?? 0}</strong><Link href="/dashboard/translations">Apri la coda →</Link></article>
        <article className="metric-card"><span>QR stabile</span><strong>{(qrResult.count ?? 0) > 0 ? "Attivo" : "Da creare"}</strong><Link href="/dashboard/site">Gestisci sito e QR →</Link></article>
      </section>
      <section className="dashboard-grid">
        <article className="dashboard-panel"><div className="panel-heading"><div><p className="eyebrow">Azioni rapide</p><h2>Cosa vuoi aggiornare?</h2></div></div><div className="quick-actions"><Link href="/dashboard/menu">Prezzi, piatti e allergeni <span>{pendingMenuMedia ? `${pendingMenuMedia} foto in revisione` : "→"}</span></Link><Link href="/dashboard/translations">Traduzioni e approvazioni <span>→</span></Link><Link href="/dashboard/site">Orari, contatti e immagini <span>{pendingBrandMedia ? `${pendingBrandMedia} in revisione` : "→"}</span></Link></div></article>
        <article className="dashboard-panel publication-panel"><p className="eyebrow">Pubblicazione controllata</p><h2>{readiness.warnings.length ? `${readiness.warnings.length} consigli prima di andare online.` : "La versione online resta al sicuro."}</h2><p>{readiness.warnings[0]?.detail ?? "Ogni conferma crea una versione immutabile. Le modifiche in bozza non appaiono agli ospiti da sole."}</p><Link className="button button-dark" href="/dashboard/menu/review">Apri la revisione</Link></article>
      </section>
    </main>
  );
}
