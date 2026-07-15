import { MenuEditor } from "@/components/dashboard/menu-editor";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ saved?: string; published?: string; error?: string }> }) {
  const params = await searchParams;
  const { membership } = await requireMembership();
  const supabase = await createClient();
  const orgId = membership.organization_id;
  const [menuResult, categoryResult, itemResult] = await Promise.all([
    supabase!.from("menus").select("id,name").eq("organization_id", orgId).limit(1).maybeSingle(),
    supabase!.from("menu_categories").select("id,name_it,slug,sort_order").eq("organization_id", orgId).order("sort_order"),
    supabase!.from("menu_items").select("id,category_id,name_it,description_it,price,available,sort_order").eq("organization_id", orgId).order("sort_order"),
  ]);
  return (
    <main className="workspace wide-workspace">
      <header className="workspace-heading"><div><p className="eyebrow">Menu</p><h1>Modifica ciò che vedono gli ospiti</h1><p>Prezzi e disponibilità sono rapidi; i testi aggiornano la coda traduzioni.</p></div></header>
      {(params.saved || params.published) && <p className="form-success" role="status">{params.published ? "Nuova versione pubblicata." : "Modifiche salvate in bozza."}</p>}
      {params.error && <p className="form-error" role="alert">{params.error === "translations-stale" ? "Approva le traduzioni obsolete prima di pubblicare." : "Operazione non riuscita. Controlla i dati e riprova."}</p>}
      {menuResult.data ? <MenuEditor menu={menuResult.data} categories={categoryResult.data ?? []} items={(itemResult.data ?? []).map((item) => ({ ...item, price: Number(item.price) }))} /> : <section className="empty-state"><h2>Nessun menu configurato</h2><p>Chiedi all’operatore di completare il provisioning iniziale.</p></section>}
    </main>
  );
}
