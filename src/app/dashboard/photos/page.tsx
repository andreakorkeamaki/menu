import { MenuImageGeneration } from "@/components/dashboard/menu-image-generation";
import { MenuImageStyleStudio } from "@/components/dashboard/menu-image-style-studio";
import { RestaurantPhotoGallery } from "@/components/dashboard/restaurant-photo-gallery";
import { requireMembership } from "@/lib/auth";
import { normalizeRestaurantPhotoFilter, restaurantPhotoStatus } from "@/lib/menu-photo-status";
import { createClient } from "@/lib/supabase/server";
import { requireSuccessfulQueries } from "@/lib/supabase/query-health";

const mediaErrorMessages: Record<string, string> = {
  invalid: "Scegli una foto valida e riprova.",
  "too-large": "La foto supera 8 MB. Esportala in una dimensione più leggera e riprova.",
  type: "Il contenuto del file non corrisponde a un’immagine JPG, PNG o WebP valida.",
  item: "Il prodotto selezionato non è più disponibile nella bozza.",
  upload: "Il caricamento privato non è riuscito. Riprova tra poco.",
  metadata: "La foto è stata rimossa perché non è stato possibile registrarla per la revisione.",
  "not-removable": "Puoi ritirare solo una foto ancora in revisione.",
  delete: "Non è stato possibile ritirare la foto.",
  remove: "Non è stato possibile rimuovere la foto dalla bozza.",
};

export default async function PhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ media_uploaded?: string; media_deleted?: string; media_error?: string; changed?: string; filter?: string }>;
}) {
  const params = await searchParams;
  const initialFilter = normalizeRestaurantPhotoFilter(params.filter);
  const { membership } = await requireMembership();
  const supabase = await createClient();
  const organizationId = membership.organization_id;
  const [menuResult, categoryResult, itemResult, mediaResult, locationResult] = await Promise.all([
    supabase!.from("menus").select("id,name").eq("organization_id", organizationId).limit(1).maybeSingle(),
    supabase!.from("menu_categories").select("id,menu_id,name_it,sort_order").eq("organization_id", organizationId).order("sort_order"),
    supabase!.from("menu_items").select("id,category_id,name_it,description_it,ingredients_it,image_url,sort_order").eq("organization_id", organizationId).order("sort_order"),
    supabase!.from("latest_menu_item_media_assets")
      .select("id,menu_item_id,ai_job_id,bucket_id,object_path,approval_status,is_public,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    supabase!.from("locations")
      .select("logo_url")
      .eq("organization_id", organizationId)
      .limit(1)
      .maybeSingle(),
  ]);
  requireSuccessfulQueries(
    "dashboard_photos_load_failed",
    menuResult, categoryResult, itemResult, mediaResult, locationResult,
  );

  const categories = categoryResult.data ?? [];
  const items = itemResult.data ?? [];
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const categoryPositionById = new Map(categories.map((category, index) => [category.id, index]));
  const aiJobIds = (mediaResult.data ?? []).flatMap((asset) => asset.ai_job_id ? [asset.ai_job_id] : []);
  const jobResult = aiJobIds.length
    ? await supabase!.from("ai_jobs").select("id,input").eq("organization_id", organizationId).in("id", aiJobIds)
    : { data: [], error: null };
  requireSuccessfulQueries("dashboard_photo_jobs_load_failed", jobResult);
  const jobById = new Map((jobResult.data ?? []).map((job) => [job.id, job]));

  const mediaEntries = await Promise.all((mediaResult.data ?? []).map(async (asset) => {
    let previewUrl: string | null = null;
    if (asset.approval_status === "draft") {
      const { data } = await supabase!.storage.from("intake").createSignedUrl(asset.object_path, 15 * 60);
      previewUrl = data?.signedUrl ?? null;
    } else if (asset.bucket_id === "public-media") {
      previewUrl = supabase!.storage.from("public-media").getPublicUrl(asset.object_path).data.publicUrl;
    }
    const job = asset.ai_job_id ? jobById.get(asset.ai_job_id) : undefined;
    const jobInput = job?.input && typeof job.input === "object" ? job.input as Record<string, unknown> : {};
    return [asset.menu_item_id!, {
      id: asset.id,
      approval_status: asset.approval_status as "draft" | "approved" | "rejected",
      is_public: asset.is_public,
      previewUrl,
      aiJobId: asset.ai_job_id,
      visualInstructions: typeof jobInput.visual_instructions === "string" ? jobInput.visual_instructions : null,
    }] as const;
  }));
  const mediaByItemId = new Map(mediaEntries);
  const galleryItems = items.map((item) => {
    const asset = mediaByItemId.get(item.id);
    return {
      id: item.id,
      name: item.name_it,
      category: categoryById.get(item.category_id)?.name_it ?? "Senza categoria",
      description: item.description_it,
      ingredients: item.ingredients_it,
      imageUrl: item.image_url,
      status: restaurantPhotoStatus({ imageUrl: item.image_url, approvalStatus: asset?.approval_status }),
      mediaAsset: asset,
    };
  });
  const approvedCount = galleryItems.filter((item) => item.status === "approved").length;
  const reviewCount = galleryItems.filter((item) => item.status === "review").length;
  const missingCount = galleryItems.length - approvedCount - reviewCount;
  const styleItems = [...items]
    .sort((first, second) => (
      (categoryPositionById.get(first.category_id) ?? Number.MAX_SAFE_INTEGER)
      - (categoryPositionById.get(second.category_id) ?? Number.MAX_SAFE_INTEGER)
      || first.sort_order - second.sort_order
    ))
    .map((item) => ({
      id: item.id,
      name: item.name_it,
      categoryId: item.category_id,
      categoryName: categoryById.get(item.category_id)?.name_it ?? "Senza categoria",
      replaceAssetId: mediaByItemId.get(item.id)?.id,
    }));

  return (
    <main className="workspace wide-workspace">
      <header className="workspace-heading"><div><p className="eyebrow">Foto</p><h1>La galleria del menu, in un solo posto</h1><p>Controlla ogni prodotto, filtra gli stati e chiedi una nuova versione con indicazioni precise. Nessuna immagine entra nel menu online senza controllo operatore e una nuova pubblicazione.</p></div><span className="review-safety-badge">Bozze protette</span></header>
      {params.media_uploaded && <p className="form-success" role="status">Foto caricata nello spazio privato e inviata al controllo qualità.</p>}
      {params.media_deleted && <p className="form-success" role="status">Foto ritirata dalla revisione.</p>}
      {params.changed === "item-photo-removed" && <p className="form-success" role="status">Foto rimossa dalla bozza. La versione online non è cambiata.</p>}
      {params.media_error && <p className="form-error" role="alert">{mediaErrorMessages[params.media_error] ?? "L’operazione sulla foto non è riuscita."}</p>}

      <section className="lead-metrics photo-metrics" aria-label="Stato galleria menu">
        <article><span>Prodotti</span><strong>{galleryItems.length}</strong><small>nel menu corrente</small></article>
        <article><span>Approvate</span><strong>{approvedCount}</strong><small>nella bozza del menu</small></article>
        <article><span>In revisione</span><strong>{reviewCount}</strong><small>ancora private</small></article>
        <article><span>Da completare</span><strong>{missingCount}</strong><small>mancanti o rifiutate</small></article>
      </section>

      <MenuImageStyleStudio items={styleItems} logoUrl={locationResult.data?.logo_url ?? null} />
      <MenuImageGeneration items={galleryItems.map((item) => ({
        id: item.id,
        name: item.name,
        hasImage: Boolean(item.imageUrl),
        mediaStatus: item.mediaAsset?.approval_status,
        assetId: item.mediaAsset?.id,
      }))} />
      <RestaurantPhotoGallery items={galleryItems} initialFilter={initialFilter} />
    </main>
  );
}
