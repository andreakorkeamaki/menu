"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMembership } from "@/lib/auth";
import { resolveOwnerAuthUser } from "@/lib/auth-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeSlug } from "@/lib/slug";
import { parseOpeningHoursInput } from "@/lib/opening-hours";
import { OptionalHttpUrlSchema } from "@/lib/safe-url";
import { assessAccentPalette } from "@/lib/color-contrast";
import {
  BRAND_MEDIA_KINDS,
  BRAND_MEDIA_MAX_BYTES,
  MENU_ITEM_MEDIA_MAX_BYTES,
  brandMediaObjectPath,
  detectBrandImageMime,
  menuItemMediaObjectPath,
} from "@/lib/brand-media";

const uuid = z.uuid();
const menuItemSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional(),
  ingredients: z.string().trim().max(2000).optional(),
  price: z.coerce.number().min(0).max(99999),
  available: z.coerce.boolean(),
  vegetarian: z.boolean(),
  vegan: z.boolean(),
  gluten_free: z.boolean(),
  allergens: z.array(uuid).max(30),
});

export async function saveMenuItem(formData: FormData) {
  const { membership } = await requireMembership();
  const parsed = menuItemSchema.safeParse({
    id: formData.get("id"), name: formData.get("name"), description: formData.get("description") || undefined,
    ingredients: formData.get("ingredients") || undefined,
    price: formData.get("price"), available: formData.get("available") === "on",
    vegetarian: formData.get("vegetarian") === "on",
    vegan: formData.get("vegan") === "on",
    gluten_free: formData.get("gluten_free") === "on",
    allergens: formData.getAll("allergens"),
  });
  if (!parsed.success) redirect("/dashboard/menu?error=invalid-item");
  const supabase = await createClient();
  const { error } = await supabase!.rpc("save_menu_item_details", {
    p_item_id: parsed.data.id,
    p_organization_id: membership.organization_id,
    p_name: parsed.data.name,
    p_description: parsed.data.description ?? "",
    p_ingredients: parsed.data.ingredients ?? "",
    p_price: parsed.data.price,
    p_available: parsed.data.available,
    p_vegetarian: parsed.data.vegetarian,
    p_vegan: parsed.data.vegan,
    p_gluten_free: parsed.data.gluten_free,
    p_allergen_ids: parsed.data.allergens,
  });
  if (error) redirect(`/dashboard/menu?error=${error.code === "23514" || error.code === "23503" ? "food-claims" : encodeURIComponent(error.code ?? "save")}`);
  revalidatePath("/dashboard/menu");
  redirect("/dashboard/menu?saved=1");
}

export async function createCategory(formData: FormData) {
  const { membership } = await requireMembership();
  const name = z.string().trim().min(1).max(160).safeParse(formData.get("name"));
  const menuId = uuid.safeParse(formData.get("menu_id"));
  if (!name.success || !menuId.success) redirect("/dashboard/menu?error=invalid-category");
  const slug = normalizeSlug(name.data);
  if (!slug) redirect("/dashboard/menu?error=invalid-category");
  const supabase = await createClient();
  const { error } = await supabase!.rpc("create_menu_category", {
    p_organization_id: membership.organization_id,
    p_menu_id: menuId.data,
    p_name: name.data,
    p_slug: slug,
  });
  if (error) redirect(`/dashboard/menu?error=${error.code === "23505" ? "category-name" : "create-category"}`);
  refreshMenuDraft();
  redirect("/dashboard/menu?changed=category-created");
}

export async function createMenuItem(formData: FormData) {
  const { membership } = await requireMembership();
  const parsed = z.object({ category_id: uuid, name: z.string().trim().min(1).max(160), price: z.coerce.number().min(0).max(99999) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/dashboard/menu?error=invalid-item");
  const supabase = await createClient();
  const { error } = await supabase!.rpc("create_menu_item", {
    p_organization_id: membership.organization_id,
    p_category_id: parsed.data.category_id,
    p_name: parsed.data.name,
    p_price: parsed.data.price,
  });
  if (error) redirect("/dashboard/menu?error=create-item");
  refreshMenuDraft();
  redirect("/dashboard/menu?changed=item-created");
}

function refreshMenuDraft() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/menu");
  revalidatePath("/dashboard/menu/review");
  revalidatePath("/dashboard/translations");
}

export async function renameCategory(formData: FormData) {
  const { membership } = await requireMembership();
  const parsed = z.object({
    category_id: uuid,
    name: z.string().trim().min(1).max(160),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/dashboard/menu?error=invalid-category");
  const supabase = await createClient();
  const { data, error } = await supabase!.from("menu_categories")
    .update({ name_it: parsed.data.name, slug: normalizeSlug(parsed.data.name) })
    .eq("id", parsed.data.category_id)
    .eq("organization_id", membership.organization_id)
    .select("id")
    .maybeSingle();
  if (error || !data) redirect(`/dashboard/menu?error=${error?.code === "23505" ? "category-name" : "structure"}`);
  refreshMenuDraft();
  redirect("/dashboard/menu?changed=category-renamed");
}

export async function deleteCategory(formData: FormData) {
  const { membership } = await requireMembership();
  const categoryId = uuid.safeParse(formData.get("category_id"));
  if (!categoryId.success) redirect("/dashboard/menu?error=invalid-category");
  const supabase = await createClient();
  const { data, error } = await supabase!.from("menu_categories")
    .delete()
    .eq("id", categoryId.data)
    .eq("organization_id", membership.organization_id)
    .select("id")
    .maybeSingle();
  if (error || !data) redirect("/dashboard/menu?error=structure");
  refreshMenuDraft();
  redirect("/dashboard/menu?changed=category-deleted");
}

export async function deleteMenuItem(formData: FormData) {
  const { membership } = await requireMembership();
  const itemId = uuid.safeParse(formData.get("item_id"));
  if (!itemId.success) redirect("/dashboard/menu?error=invalid-item");
  const supabase = await createClient();
  const { data, error } = await supabase!.from("menu_items")
    .delete()
    .eq("id", itemId.data)
    .eq("organization_id", membership.organization_id)
    .select("id")
    .maybeSingle();
  if (error || !data) redirect("/dashboard/menu?error=structure");
  refreshMenuDraft();
  redirect("/dashboard/menu?changed=item-deleted");
}

export async function moveMenuItem(formData: FormData) {
  const { membership } = await requireMembership();
  const parsed = z.object({ item_id: uuid, target_category_id: uuid }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/dashboard/menu?error=invalid-item");
  const supabase = await createClient();
  const { error } = await supabase!.rpc("move_menu_item", {
    p_organization_id: membership.organization_id,
    p_item_id: parsed.data.item_id,
    p_target_category_id: parsed.data.target_category_id,
  });
  if (error) redirect("/dashboard/menu?error=structure");
  refreshMenuDraft();
  redirect("/dashboard/menu?changed=item-moved");
}

export async function reorderMenuEntity(formData: FormData) {
  const { membership } = await requireMembership();
  const parsed = z.object({
    entity_id: uuid,
    entity_type: z.enum(["category", "item"]),
    direction: z.enum(["up", "down"]),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/dashboard/menu?error=structure");
  const supabase = await createClient();
  const { error } = await supabase!.rpc("reorder_menu_entity", {
    p_organization_id: membership.organization_id,
    p_entity_type: parsed.data.entity_type,
    p_entity_id: parsed.data.entity_id,
    p_direction: parsed.data.direction,
  });
  if (error) redirect("/dashboard/menu?error=structure");
  refreshMenuDraft();
  redirect("/dashboard/menu?changed=reordered");
}

export async function publishMenu(formData: FormData) {
  const { membership } = await requireMembership();
  const menuId = uuid.safeParse(formData.get("menu_id"));
  if (!menuId.success) redirect("/dashboard/menu?error=invalid-menu");
  const supabase = await createClient();
  const { error } = await supabase!.rpc("publish_menu", { p_menu_id: menuId.data, p_organization_id: membership.organization_id });
  if (error) {
    const reason = error.code === "P0001" ? "translations-stale" : error.code === "P0003" ? "no-changes" : "publish";
    redirect(`/dashboard/menu?error=${reason}`);
  }
  updateTag("public-menus");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/menu");
  revalidatePath("/r", "layout");
  redirect("/dashboard/menu?published=1");
}

export async function restorePublishedVersion(formData: FormData) {
  const { membership } = await requireMembership();
  const publicationId = uuid.safeParse(formData.get("publication_id"));
  if (!publicationId.success) redirect("/dashboard/menu/review?history_error=invalid");
  const supabase = await createClient();
  const { error } = await supabase!.rpc("restore_menu_publication", {
    p_publication_id: publicationId.data,
    p_organization_id: membership.organization_id,
  });
  if (error) {
    const reason = error.code === "P0002" ? "missing" : error.code === "42501" ? "forbidden" : "restore";
    redirect(`/dashboard/menu/review?history_error=${reason}`);
  }
  updateTag("public-menus");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/menu/review");
  revalidatePath("/r", "layout");
  redirect("/dashboard/menu/review?restored=1");
}

export async function saveLocation(formData: FormData) {
  const { membership } = await requireMembership();
  const openingHours = parseOpeningHoursInput(
    formData.getAll("opening_days"),
    formData.getAll("opening_times"),
  );
  const parsed = z.object({
    id: uuid, name: z.string().trim().min(1).max(160), slug: z.string().trim().min(1), tagline_it: z.string().trim().max(240), description_it: z.string().trim().max(3000),
    address: z.string().trim().max(300), city: z.string().trim().max(120), phone: z.string().trim().max(50), email: z.union([z.email(), z.literal("")]),
    whatsapp_url: OptionalHttpUrlSchema, reservation_url: OptionalHttpUrlSchema, map_url: OptionalHttpUrlSchema, instagram_url: OptionalHttpUrlSchema,
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || !openingHours.success) redirect("/dashboard/site?error=invalid-site");
  const { id, slug, ...values } = parsed.data;
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) redirect("/dashboard/site?error=invalid-site");
  const supabase = await createClient();
  const { data, error } = await supabase!.from("locations").update({ ...values, opening_hours: openingHours.data, slug: normalizedSlug, email: values.email || null, whatsapp_url: values.whatsapp_url || null, reservation_url: values.reservation_url || null, map_url: values.map_url || null, instagram_url: values.instagram_url || null }).eq("id", id).eq("organization_id", membership.organization_id).select("id").maybeSingle();
  if (error || !data) redirect("/dashboard/site?error=save-site");
  revalidatePath("/dashboard/site");
  revalidatePath("/dashboard/menu/preview");
  revalidatePath("/dashboard/menu/review");
  revalidatePath("/dashboard/translations");
  redirect("/dashboard/site?saved=1");
}

export async function saveTheme(formData: FormData) {
  const { membership } = await requireMembership();
  const parsed = z.object({ id: uuid, theme_key: z.enum(["editorial", "minimal"]), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/dashboard/site?error=invalid-theme");
  const supabase = await createClient();
  const { data: currentTheme, error: readError } = await supabase!.from("themes")
    .select("background,surface")
    .eq("id", parsed.data.id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (readError || !currentTheme) redirect("/dashboard/site?error=save-theme");
  const assessment = assessAccentPalette({
    accent: parsed.data.accent,
    background: currentTheme.background,
    surface: currentTheme.surface,
  });
  if (!assessment.safe) redirect("/dashboard/site?error=theme-contrast");
  const { data, error } = await supabase!.from("themes").update({ theme_key: parsed.data.theme_key, accent: parsed.data.accent, accent_text: assessment.accentText }).eq("id", parsed.data.id).eq("organization_id", membership.organization_id).select("id").maybeSingle();
  if (error || !data) redirect("/dashboard/site?error=save-theme");
  revalidatePath("/dashboard/site");
  revalidatePath("/dashboard/menu/preview");
  revalidatePath("/dashboard/menu/review");
  redirect("/dashboard/site?saved=1");
}

export async function uploadBrandMedia(formData: FormData) {
  const { membership } = await requireMembership();
  const parsed = z.object({
    location_id: uuid,
    media_kind: z.enum(BRAND_MEDIA_KINDS),
    alt_text: z.string().trim().max(240),
  }).safeParse(Object.fromEntries(formData));
  const file = formData.get("file");
  if (!parsed.success || !(file instanceof File) || file.size === 0) {
    redirect("/dashboard/site?media_error=invalid");
  }
  if (file.size > BRAND_MEDIA_MAX_BYTES) {
    redirect("/dashboard/site?media_error=too-large");
  }

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const detectedMime = detectBrandImageMime(header);
  if (!detectedMime || file.type !== detectedMime) {
    redirect("/dashboard/site?media_error=type");
  }

  const supabase = await createClient();
  const { data: location } = await supabase!.from("locations")
    .select("id")
    .eq("id", parsed.data.location_id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (!location) redirect("/dashboard/site?media_error=location");

  const objectPath = brandMediaObjectPath(
    membership.organization_id,
    parsed.data.media_kind,
    crypto.randomUUID(),
    detectedMime,
  );
  const { error: uploadError } = await supabase!.storage.from("intake").upload(objectPath, file, {
    contentType: detectedMime,
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) redirect("/dashboard/site?media_error=upload");

  const { error: metadataError } = await supabase!.from("media_assets").insert({
    organization_id: membership.organization_id,
    location_id: location.id,
    bucket_id: "intake",
    object_path: objectPath,
    media_kind: parsed.data.media_kind,
    mime_type: detectedMime,
    alt_text: parsed.data.alt_text || null,
    approval_status: "draft",
    is_public: false,
    created_by: membership.user_id,
  });
  if (metadataError) {
    await supabase!.storage.from("intake").remove([objectPath]);
    redirect("/dashboard/site?media_error=metadata");
  }

  revalidatePath("/dashboard/site");
  revalidatePath("/ops/media");
  redirect(`/dashboard/site?media_uploaded=${parsed.data.media_kind}`);
}

export async function uploadMenuItemMedia(formData: FormData) {
  const { membership } = await requireMembership();
  const parsed = z.object({
    item_id: uuid,
    alt_text: z.string().trim().max(240),
  }).safeParse(Object.fromEntries(formData));
  const file = formData.get("file");
  if (!parsed.success || !(file instanceof File) || file.size === 0) {
    redirect("/dashboard/menu?media_error=invalid");
  }
  if (file.size > MENU_ITEM_MEDIA_MAX_BYTES) {
    redirect("/dashboard/menu?media_error=too-large");
  }

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const detectedMime = detectBrandImageMime(header);
  if (!detectedMime || file.type !== detectedMime) {
    redirect("/dashboard/menu?media_error=type");
  }

  const supabase = await createClient();
  const { data: item, error: itemError } = await supabase!.from("menu_items")
    .select("id,category_id,name_it")
    .eq("id", parsed.data.item_id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (itemError || !item) redirect("/dashboard/menu?media_error=item");
  const { data: category, error: categoryError } = await supabase!.from("menu_categories")
    .select("menu_id")
    .eq("id", item.category_id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (categoryError || !category) redirect("/dashboard/menu?media_error=item");

  const objectPath = menuItemMediaObjectPath(
    membership.organization_id,
    item.id,
    crypto.randomUUID(),
    detectedMime,
  );
  const { error: uploadError } = await supabase!.storage.from("intake").upload(objectPath, file, {
    contentType: detectedMime,
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) redirect("/dashboard/menu?media_error=upload");

  const { error: metadataError } = await supabase!.from("media_assets").insert({
    organization_id: membership.organization_id,
    menu_id: category.menu_id,
    menu_item_id: item.id,
    bucket_id: "intake",
    object_path: objectPath,
    media_kind: "menu_item",
    mime_type: detectedMime,
    alt_text: parsed.data.alt_text || item.name_it,
    approval_status: "draft",
    is_public: false,
    created_by: membership.user_id,
  });
  if (metadataError) {
    await supabase!.storage.from("intake").remove([objectPath]);
    redirect("/dashboard/menu?media_error=metadata");
  }

  revalidatePath("/dashboard/menu");
  revalidatePath("/ops/media");
  redirect(`/dashboard/menu?media_uploaded=${item.id}`);
}

export async function deleteMenuItemMedia(formData: FormData) {
  const { membership } = await requireMembership();
  const assetId = uuid.safeParse(formData.get("asset_id"));
  if (!assetId.success) redirect("/dashboard/menu?media_error=invalid");
  const supabase = await createClient();
  const { data: asset } = await supabase!.from("media_assets")
    .select("id,object_path")
    .eq("id", assetId.data)
    .eq("organization_id", membership.organization_id)
    .eq("media_kind", "menu_item")
    .eq("bucket_id", "intake")
    .eq("approval_status", "draft")
    .eq("is_public", false)
    .maybeSingle();
  if (!asset) redirect("/dashboard/menu?media_error=not-removable");

  const { error: deleteError } = await supabase!.from("media_assets")
    .delete()
    .eq("id", asset.id)
    .eq("organization_id", membership.organization_id);
  if (deleteError) redirect("/dashboard/menu?media_error=delete");
  await supabase!.storage.from("intake").remove([asset.object_path]);

  revalidatePath("/dashboard/menu");
  revalidatePath("/ops/media");
  redirect("/dashboard/menu?media_deleted=1");
}

export async function removeMenuItemImage(formData: FormData) {
  const { membership } = await requireMembership();
  const itemId = uuid.safeParse(formData.get("item_id"));
  if (!itemId.success) redirect("/dashboard/menu?media_error=invalid");
  const supabase = await createClient();
  const { error } = await supabase!.rpc("remove_menu_item_image", {
    p_organization_id: membership.organization_id,
    p_menu_item_id: itemId.data,
  });
  if (error) redirect("/dashboard/menu?media_error=remove");
  revalidatePath("/dashboard/menu");
  revalidatePath("/dashboard/menu/preview");
  revalidatePath("/dashboard/menu/review");
  redirect("/dashboard/menu?changed=item-photo-removed");
}

export async function deleteBrandMedia(formData: FormData) {
  const { membership } = await requireMembership();
  const assetId = uuid.safeParse(formData.get("asset_id"));
  if (!assetId.success) redirect("/dashboard/site?media_error=invalid");
  const supabase = await createClient();
  const { data: asset } = await supabase!.from("media_assets")
    .select("id,object_path")
    .eq("id", assetId.data)
    .eq("organization_id", membership.organization_id)
    .eq("bucket_id", "intake")
    .eq("approval_status", "draft")
    .eq("is_public", false)
    .maybeSingle();
  if (!asset) redirect("/dashboard/site?media_error=not-removable");

  const { error: deleteError } = await supabase!.from("media_assets")
    .delete()
    .eq("id", asset.id)
    .eq("organization_id", membership.organization_id);
  if (deleteError) redirect("/dashboard/site?media_error=delete");
  await supabase!.storage.from("intake").remove([asset.object_path]);

  revalidatePath("/dashboard/site");
  revalidatePath("/ops/media");
  redirect("/dashboard/site?media_deleted=1");
}

export async function inviteMember(formData: FormData) {
  const { membership } = await requireMembership();
  if (membership.role !== "owner") redirect("/dashboard/team?error=owner-only");
  const parsed = z.object({ email: z.email(), role: z.enum(["owner", "editor"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/dashboard/team?error=invalid");
  const admin = createAdminClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  let resolved: Awaited<ReturnType<typeof resolveOwnerAuthUser>>;
  try {
    const callback = new URL("/auth/callback", origin);
    callback.searchParams.set("next", "/login/reset-password?mode=invite");
    resolved = await resolveOwnerAuthUser({
      admin,
      email: parsed.data.email,
      fullName: parsed.data.email.split("@")[0],
      redirectTo: callback.toString(),
    });
  } catch {
    redirect("/dashboard/team?error=invite");
  }
  const { error: membershipError } = await admin.from("memberships").upsert({ organization_id: membership.organization_id, user_id: resolved.user.id, role: parsed.data.role, created_by: membership.user_id }, { onConflict: "organization_id,user_id" });
  if (membershipError) {
    if (resolved.invitation === "sent") await admin.auth.admin.deleteUser(resolved.user.id);
    redirect("/dashboard/team?error=membership");
  }
  revalidatePath("/dashboard/team");
  redirect(`/dashboard/team?invited=${resolved.invitation}`);
}

function memberActionError(code: string | undefined) {
  if (code === "P0001") return "owner-guard";
  if (code === "P0002") return "not-found";
  if (code === "42501") return "owner-only";
  return "member-action";
}

export async function updateMemberRole(formData: FormData) {
  const { membership } = await requireMembership();
  if (membership.role !== "owner") redirect("/dashboard/team?error=owner-only");
  const parsed = z.object({
    membership_id: uuid,
    role: z.enum(["owner", "editor"]),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/dashboard/team?error=invalid-member");

  const supabase = await createClient();
  const { error } = await supabase!.rpc("manage_organization_member", {
    p_organization_id: membership.organization_id,
    p_membership_id: parsed.data.membership_id,
    p_action: "update_role",
    p_role: parsed.data.role,
  });
  if (error) redirect(`/dashboard/team?error=${memberActionError(error.code)}`);
  revalidatePath("/dashboard/team");
  redirect("/dashboard/team?member=role-updated");
}

export async function removeMember(formData: FormData) {
  const { membership } = await requireMembership();
  if (membership.role !== "owner") redirect("/dashboard/team?error=owner-only");
  const membershipId = uuid.safeParse(formData.get("membership_id"));
  if (!membershipId.success) redirect("/dashboard/team?error=invalid-member");

  const supabase = await createClient();
  const { error } = await supabase!.rpc("manage_organization_member", {
    p_organization_id: membership.organization_id,
    p_membership_id: membershipId.data,
    p_action: "remove",
    p_role: null,
  });
  if (error) redirect(`/dashboard/team?error=${memberActionError(error.code)}`);
  revalidatePath("/dashboard/team");
  redirect("/dashboard/team?member=removed");
}

export async function reviewTranslation(formData: FormData) {
  const { membership } = await requireMembership();
  const parsed = z.object({
    translation_id: uuid,
    translated_text: z.string().trim().min(1).max(5000),
    action: z.enum(["save", "approve"]),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/dashboard/translations?translation_error=invalid");
  const supabase = await createClient();
  const { error } = await supabase!.rpc("review_translation", {
    p_translation_id: parsed.data.translation_id,
    p_organization_id: membership.organization_id,
    p_translated_text: parsed.data.translated_text,
    p_action: parsed.data.action,
  });
  if (error) redirect("/dashboard/translations?translation_error=review");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/translations");
  redirect(`/dashboard/translations?reviewed=${parsed.data.action}`);
}

export async function approveAllTranslations() {
  const { membership } = await requireMembership();
  const supabase = await createClient();
  const { data, error } = await supabase!.rpc("approve_translation_drafts", {
    p_organization_id: membership.organization_id,
  });
  if (error) redirect("/dashboard/translations?translation_error=bulk-approval");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/translations");
  redirect(`/dashboard/translations?approved_all=${Number(data ?? 0)}`);
}
