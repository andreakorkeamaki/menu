import { MenuEditor, type MenuEditorFocus } from "@/components/dashboard/menu-editor";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { requireSuccessfulQueries } from "@/lib/supabase/query-health";

const changeMessages: Record<string, string> = {
  "category-created": "Categoria aggiunta in fondo alla bozza del menu.",
  "category-renamed": "Categoria rinominata. Le traduzioni collegate sono ora da rivedere.",
  "category-deleted": "Categoria e relativi piatti rimossi dalla bozza. La versione online non è cambiata.",
  "item-created": "Piatto aggiunto in fondo alla categoria.",
  "item-photo-removed": "Foto rimossa dalla bozza del piatto. La versione online non è cambiata.",
  "item-deleted": "Piatto rimosso dalla bozza. La versione online non è cambiata.",
  "item-moved": "Piatto spostato nella nuova categoria.",
  reordered: "Ordine del menu aggiornato nella bozza.",
};

const errorMessages: Record<string, string> = {
  "translations-stale": "Completa e approva tutte le traduzioni richieste prima di pubblicare. La versione online precedente non è stata modificata.",
  "no-changes": "La bozza coincide già con il menu online: non è stata creata una versione duplicata.",
  "food-claims": "Controlla allergeni e indicazioni alimentari: un piatto senza glutine non può dichiarare il glutine, e puoi selezionare soltanto allergeni del tuo ristorante.",
  "category-name": "Esiste già una categoria con questo nome. Scegline uno diverso.",
  "invalid-category": "Inserisci un nome valido per la categoria.",
  "invalid-item": "Controlla nome e prezzo del piatto. Il prezzo deve essere compreso tra 0 e 99.999 euro.",
  "create-category": "La categoria non è stata aggiunta. Aggiorna la pagina e riprova.",
  "create-item": "Il piatto non è stato aggiunto. Aggiorna la pagina e riprova.",
  structure: "La struttura non è stata modificata. Aggiorna la pagina e riprova.",
};

const mediaErrorMessages: Record<string, string> = {
  invalid: "Scegli una foto valida e riprova.",
  "too-large": "La foto supera 8 MB. Esportala in una dimensione più leggera e riprova.",
  type: "Il contenuto del file non corrisponde a un’immagine JPG, PNG o WebP valida.",
  item: "Il piatto selezionato non è più disponibile nella tua bozza.",
  upload: "Il caricamento privato non è riuscito. Riprova tra poco.",
  metadata: "La foto è stata rimossa perché non è stato possibile registrarla per la revisione.",
  "not-removable": "Puoi ritirare solo una foto ancora in revisione.",
  delete: "Non è stato possibile ritirare la foto.",
  remove: "Non è stato possibile rimuovere la foto dalla bozza.",
};

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ saved?: string; published?: string; changed?: string; error?: string; media_uploaded?: string; media_deleted?: string; media_error?: string; focus?: string }> }) {
  const params = await searchParams;
  const focus: MenuEditorFocus | null = params.focus === "food-info" || params.focus === "descriptions" ? params.focus : null;
  const { membership } = await requireMembership();
  const supabase = await createClient();
  const orgId = membership.organization_id;
  const [menuResult, categoryResult, itemResult, allergenResult, itemAllergenResult, mediaResult] = await Promise.all([
    supabase!.from("menus").select("id,name").eq("organization_id", orgId).limit(1).maybeSingle(),
    supabase!.from("menu_categories").select("id,name_it,slug,sort_order").eq("organization_id", orgId).order("sort_order"),
    supabase!.from("menu_items").select("id,category_id,name_it,description_it,ingredients_it,price,available,vegetarian,vegan,gluten_free,image_url,sort_order").eq("organization_id", orgId).order("sort_order"),
    supabase!.from("allergens").select("id,code,name_it").eq("organization_id", orgId).order("name_it"),
    supabase!.from("item_allergens").select("item_id,allergen_id").eq("organization_id", orgId),
    supabase!.from("latest_menu_item_media_assets")
      .select("id,menu_item_id,bucket_id,object_path,approval_status,is_public,created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
  ]);
  requireSuccessfulQueries(
    "dashboard_menu_load_failed",
    menuResult, categoryResult, itemResult, allergenResult, itemAllergenResult, mediaResult,
  );
  const latestMediaRows = mediaResult.data ?? [];
  const mediaAssets = Object.fromEntries(await Promise.all(latestMediaRows.map(async (asset) => {
    let previewUrl: string | null = null;
    if (asset.approval_status !== "rejected") {
      if (asset.bucket_id === "public-media") {
        previewUrl = supabase!.storage.from("public-media").getPublicUrl(asset.object_path).data.publicUrl;
      } else {
        const { data } = await supabase!.storage.from("intake").createSignedUrl(asset.object_path, 15 * 60);
        previewUrl = data?.signedUrl ?? null;
      }
    }
    return [asset.menu_item_id!, {
      id: asset.id,
      approval_status: asset.approval_status as "draft" | "approved" | "rejected",
      is_public: asset.is_public,
      previewUrl,
    }] as const;
  })));
  return (
    <main className="workspace wide-workspace">
      <header className="workspace-heading"><div><p className="eyebrow">Menu</p><h1>Modifica ciò che vedono gli ospiti</h1><p>Prezzi e disponibilità sono rapidi; i testi aggiornano la coda traduzioni.</p></div></header>
      {(params.saved || params.published) && <p className="form-success" role="status">{params.published ? "Nuova versione pubblicata." : "Modifiche salvate in bozza."}</p>}
      {params.changed && <p className="form-success" role="status">{changeMessages[params.changed] ?? "Struttura del menu aggiornata nella bozza."}</p>}
      {params.error && <p className="form-error" role="alert">{errorMessages[params.error] ?? "Operazione non riuscita. Controlla i dati e riprova."}</p>}
      {params.media_uploaded && <p className="form-success" role="status">Foto caricata nello spazio privato. Dopo il controllo qualità verrà collegata alla bozza del piatto.</p>}
      {params.media_deleted && <p className="form-success" role="status">Foto ritirata dalla revisione.</p>}
      {params.media_error && <p className="form-error" role="alert">{mediaErrorMessages[params.media_error] ?? "L’operazione sulla foto non è riuscita."}</p>}
      {menuResult.data ? <MenuEditor menu={menuResult.data} categories={categoryResult.data ?? []} items={(itemResult.data ?? []).map((item) => ({ ...item, price: Number(item.price) }))} allergens={allergenResult.data ?? []} itemAllergens={itemAllergenResult.data ?? []} mediaAssets={mediaAssets} focus={focus} /> : <section className="empty-state"><h2>Nessun menu configurato</h2><p>Chiedi all’operatore di completare il provisioning iniziale.</p></section>}
    </main>
  );
}
