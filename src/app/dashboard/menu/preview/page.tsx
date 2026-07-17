import Link from "next/link";
import { z } from "zod";
import { PublicSite } from "@/components/public-site/public-site";
import { requireMembership } from "@/lib/auth";
import { buildDraftMenuPreview } from "@/lib/draft-menu-preview";
import { createClient } from "@/lib/supabase/server";
import { requireSuccessfulQueries } from "@/lib/supabase/query-health";
import { SUPPORTED_LOCALES, type Locale } from "@/types/domain";

const localeSchema = z.enum(SUPPORTED_LOCALES);

export const metadata = {
  title: "Anteprima privata · MenuInterattivo",
  robots: { index: false, follow: false },
};

export default async function DraftMenuPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const params = await searchParams;
  const { membership } = await requireMembership();
  const supabase = await createClient();
  const organizationId = membership.organization_id;
  const [
    menuResult,
    locationResult,
    themeResult,
    categoryResult,
    itemResult,
    variantResult,
    allergenResult,
    itemAllergenResult,
    translationResult,
  ] = await Promise.all([
    supabase!.from("menus").select("id,name,currency,source_locale,active_locales,updated_at").eq("organization_id", organizationId).limit(1).maybeSingle(),
    supabase!.from("locations").select("id,slug,name,tagline_it,description_it,address,city,phone,email,whatsapp_url,reservation_url,map_url,instagram_url,opening_hours,logo_url,cover_url").eq("organization_id", organizationId).limit(1).maybeSingle(),
    supabase!.from("themes").select("theme_key,background,surface,text,muted,accent,accent_text,heading_font,body_font,radius").eq("organization_id", organizationId).eq("is_active", true).limit(1).maybeSingle(),
    supabase!.from("menu_categories").select("id,slug,name_it,description_it,sort_order").eq("organization_id", organizationId).order("sort_order"),
    supabase!.from("menu_items").select("id,category_id,name_it,description_it,ingredients_it,price,available,vegetarian,vegan,gluten_free,image_url,sort_order").eq("organization_id", organizationId).order("sort_order"),
    supabase!.from("item_variants").select("id,item_id,name_it,price_delta,available,sort_order").eq("organization_id", organizationId).order("sort_order"),
    supabase!.from("allergens").select("id,name_it").eq("organization_id", organizationId),
    supabase!.from("item_allergens").select("item_id,allergen_id").eq("organization_id", organizationId),
    supabase!.from("translations").select("entity_type,entity_id,field_name,locale,translated_text,status").eq("organization_id", organizationId),
  ]);
  requireSuccessfulQueries(
    "dashboard_draft_preview_load_failed",
    menuResult, locationResult, themeResult, categoryResult, itemResult,
    variantResult, allergenResult, itemAllergenResult, translationResult,
  );

  if (!menuResult.data || !locationResult.data) {
    return (
      <main className="workspace">
        <section className="empty-state">
          <h1>Anteprima non ancora disponibile</h1>
          <p>Completa prima il provisioning di sede e menu.</p>
          <Link className="button button-light" href="/dashboard/menu/review">Torna alla revisione</Link>
        </section>
      </main>
    );
  }

  const snapshot = buildDraftMenuPreview({
    organizationId,
    menu: menuResult.data,
    location: locationResult.data,
    theme: themeResult.data,
    categories: categoryResult.data ?? [],
    items: itemResult.data ?? [],
    variants: variantResult.data ?? [],
    allergens: allergenResult.data ?? [],
    itemAllergens: itemAllergenResult.data ?? [],
    translations: translationResult.data ?? [],
  });
  const requestedLocale = localeSchema.safeParse(params.locale);
  const locale: Locale = requestedLocale.success && snapshot.menu.active_locales.includes(requestedLocale.data)
    ? requestedLocale.data
    : "it";
  const pendingTranslations = locale === "it" ? 0 : (translationResult.data ?? []).filter(
    (translation) => translation.locale === locale && translation.status !== "approved",
  ).length;

  return (
    <div className="draft-preview-stage">
      <PublicSite
        snapshot={snapshot}
        locale={locale}
        preview={{ basePath: "/dashboard/menu/preview", pendingTranslations }}
      />
    </div>
  );
}
