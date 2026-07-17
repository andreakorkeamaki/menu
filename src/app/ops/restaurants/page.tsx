import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import {
  parseRestaurantListPage,
  RESTAURANT_LIST_PAGE_SIZE,
  restaurantListHref,
} from "@/lib/restaurant-list";
import { createClient } from "@/lib/supabase/server";
import { requireSuccessfulQueries } from "@/lib/supabase/query-health";

const organizationStatusLabels: Record<string, string> = {
  onboarding: "In onboarding",
  active: "Attivo",
  suspended: "Sospeso",
};

type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
  locations: Array<{
    id: string;
    name: string;
    slug: string;
    city: string;
    status: string;
    sort_order: number;
  }> | null;
  memberships: Array<{
    id: string;
    role: string;
    user_id: string;
    profile: { id: string; full_name: string } | Array<{ id: string; full_name: string }> | null;
  }> | null;
  onboarding_cases: Array<{
    id: string;
    status: string;
    updated_at: string;
    contact_name: string | null;
    contact_email: string | null;
  }> | null;
};

export default async function RestaurantsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = parseRestaurantListPage(params.page);
  const rangeStart = (page - 1) * RESTAURANT_LIST_PAGE_SIZE;
  const context = await requireOperator();
  const supabase = await createClient();
  const [restaurantsResult, activeResult, onboardingResult, suspendedResult] = await Promise.all([
    supabase!.from("organizations")
      .select(`
        id,name,slug,status,created_at,
        locations(id,name,slug,city,status,sort_order),
        memberships(id,role,user_id,profile:profiles(id,full_name)),
        onboarding_cases(id,status,updated_at,contact_name,contact_email)
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(rangeStart, rangeStart + RESTAURANT_LIST_PAGE_SIZE - 1),
    supabase!.from("organizations").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase!.from("organizations").select("id", { count: "exact", head: true }).eq("status", "onboarding"),
    supabase!.from("organizations").select("id", { count: "exact", head: true }).eq("status", "suspended"),
  ]);
  requireSuccessfulQueries(
    "ops_restaurant_list_load_failed",
    restaurantsResult,
    activeResult,
    onboardingResult,
    suspendedResult,
  );

  const restaurants = (restaurantsResult.data ?? []) as unknown as RestaurantRow[];
  const totalRestaurants = restaurantsResult.count ?? restaurants.length;
  const totalPages = Math.max(1, Math.ceil(totalRestaurants / RESTAURANT_LIST_PAGE_SIZE));
  if (page > totalPages) redirect(restaurantListHref(totalPages));
  const firstVisible = restaurants.length ? rangeStart + 1 : 0;
  const lastVisible = restaurants.length ? rangeStart + restaurants.length : 0;

  return (
    <main className="workspace wide-workspace">
      <header className="workspace-heading">
        <div>
          <p className="eyebrow">Portafoglio clienti</p>
          <h1>Ristoranti</h1>
          <p>Tutti i tenant restano gestibili dall’area operatore, senza entrare nella dashboard riservata al cliente.</p>
        </div>
        <Link className="button button-dark" href="/ops/new">Nuovo ristorante</Link>
      </header>

      <section className="lead-metrics restaurant-metrics" aria-label="Riepilogo ristoranti">
        <article><span>Totali</span><strong>{totalRestaurants}</strong></article>
        <article><span>In onboarding</span><strong>{onboardingResult.count ?? 0}</strong></article>
        <article><span>Attivi</span><strong>{activeResult.count ?? 0}</strong></article>
        <article><span>Sospesi</span><strong>{suspendedResult.count ?? 0}</strong></article>
      </section>

      <section className="dashboard-panel restaurant-directory">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Directory tenant</p>
            <h2>Accessi e stato operativo</h2>
            <small>{restaurants.length ? `${firstVisible}–${lastVisible} di ${totalRestaurants} ristoranti` : "Nessun ristorante creato"}</small>
          </div>
          <span className="count-badge">{totalRestaurants}</span>
        </div>

        {restaurants.length ? (
          <div className="ops-table restaurant-table">
            <div className="ops-table-head"><span>Ristorante</span><span>Stato</span><span>Account cliente</span><span>Azioni operatore</span></div>
            {restaurants.map((restaurant) => {
              const location = [...(restaurant.locations ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0];
              const owner = (restaurant.memberships ?? []).find(
                (membership) => membership.role === "owner" && membership.user_id !== context.profile.id,
              ) ?? (restaurant.memberships ?? []).find((membership) => membership.role === "owner");
              const onboarding = [...(restaurant.onboarding_cases ?? [])]
                .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];
              const ownerProfile = Array.isArray(owner?.profile) ? owner.profile[0] : owner?.profile;
              const ownerName = ownerProfile?.full_name || onboarding?.contact_name || "Proprietario da associare";

              return (
                <article key={restaurant.id}>
                  <div>
                    <strong>{location?.name ?? restaurant.name}</strong>
                    <small>{location?.city ? `${location.city} · ` : ""}{restaurant.slug}</small>
                    <time dateTime={restaurant.created_at}>Creato {formatDateTime(restaurant.created_at)}</time>
                  </div>
                  <span className={`status-pill restaurant-status-${restaurant.status}`}>
                    {organizationStatusLabels[restaurant.status] ?? restaurant.status}
                  </span>
                  <div>
                    <strong>{ownerName}</strong>
                    <small>{onboarding?.contact_email ?? "Email non disponibile"}</small>
                  </div>
                  <div className="restaurant-actions">
                    <Link href={`/ops/restaurants/${restaurant.id}`}>Gestisci accessi →</Link>
                    {onboarding ? <Link href={`/ops/import?case=${onboarding.id}`}>Apri onboarding →</Link> : <Link href="/ops/import">Apri importazioni →</Link>}
                    {location?.status === "active" ? <a href={`/r/${location.slug}`} target="_blank" rel="noreferrer">Sito pubblico ↗</a> : <small>Sito non ancora online</small>}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <h3>Nessun ristorante</h3>
            <p>Crea il primo tenant e assegna come proprietario l’account separato del ristorante di prova.</p>
            <Link className="button button-dark" href="/ops/new">Crea ristorante</Link>
          </div>
        )}

        {totalPages > 1 ? (
          <nav className="ops-queue-pagination" aria-label="Pagine dei ristoranti">
            {page > 1 ? <Link href={restaurantListHref(page - 1)}>← Più recenti</Link> : <span />}
            <span>Pagina {page} di {totalPages}</span>
            {page < totalPages ? <Link href={restaurantListHref(page + 1)}>Meno recenti →</Link> : <span />}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
