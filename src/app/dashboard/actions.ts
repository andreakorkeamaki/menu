"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMembership } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeSlug } from "@/lib/slug";

const uuid = z.uuid();
const menuItemSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional(),
  price: z.coerce.number().min(0).max(99999),
  available: z.coerce.boolean(),
});

export async function saveMenuItem(formData: FormData) {
  const { membership } = await requireMembership();
  const parsed = menuItemSchema.safeParse({
    id: formData.get("id"), name: formData.get("name"), description: formData.get("description") || undefined,
    price: formData.get("price"), available: formData.get("available") === "on",
  });
  if (!parsed.success) redirect("/dashboard/menu?error=invalid-item");
  const supabase = await createClient();
  const { error } = await supabase!.from("menu_items").update({
    name_it: parsed.data.name,
    description_it: parsed.data.description ?? null,
    price: parsed.data.price,
    available: parsed.data.available,
  }).eq("id", parsed.data.id).eq("organization_id", membership.organization_id);
  if (error) redirect(`/dashboard/menu?error=${encodeURIComponent(error.code ?? "save")}`);
  revalidatePath("/dashboard/menu");
  redirect("/dashboard/menu?saved=1");
}

export async function createCategory(formData: FormData) {
  const { membership } = await requireMembership();
  const name = z.string().trim().min(1).max(120).safeParse(formData.get("name"));
  const menuId = uuid.safeParse(formData.get("menu_id"));
  if (!name.success || !menuId.success) redirect("/dashboard/menu?error=invalid-category");
  const supabase = await createClient();
  const { count } = await supabase!.from("menu_categories").select("id", { count: "exact", head: true }).eq("menu_id", menuId.data);
  const { error } = await supabase!.from("menu_categories").insert({
    organization_id: membership.organization_id,
    menu_id: menuId.data,
    name_it: name.data,
    slug: normalizeSlug(name.data),
    sort_order: count ?? 0,
  });
  if (error) redirect("/dashboard/menu?error=create-category");
  revalidatePath("/dashboard/menu");
  redirect("/dashboard/menu?saved=1");
}

export async function createMenuItem(formData: FormData) {
  const { membership } = await requireMembership();
  const parsed = z.object({ category_id: uuid, name: z.string().trim().min(1).max(160), price: z.coerce.number().min(0) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/dashboard/menu?error=invalid-item");
  const supabase = await createClient();
  const { count } = await supabase!.from("menu_items").select("id", { count: "exact", head: true }).eq("category_id", parsed.data.category_id);
  const { error } = await supabase!.from("menu_items").insert({ organization_id: membership.organization_id, category_id: parsed.data.category_id, name_it: parsed.data.name, price: parsed.data.price, sort_order: count ?? 0 });
  if (error) redirect("/dashboard/menu?error=create-item");
  revalidatePath("/dashboard/menu");
  redirect("/dashboard/menu?saved=1");
}

export async function publishMenu(formData: FormData) {
  const { membership } = await requireMembership();
  const menuId = uuid.safeParse(formData.get("menu_id"));
  if (!menuId.success) redirect("/dashboard/menu?error=invalid-menu");
  const supabase = await createClient();
  const { error } = await supabase!.rpc("publish_menu", { p_menu_id: menuId.data, p_organization_id: membership.organization_id });
  if (error) redirect(`/dashboard/menu?error=${error.code === "P0001" ? "translations-stale" : "publish"}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/menu");
  revalidatePath("/r", "layout");
  redirect("/dashboard/menu?published=1");
}

export async function saveLocation(formData: FormData) {
  const { membership } = await requireMembership();
  const parsed = z.object({
    id: uuid, name: z.string().trim().min(1).max(160), slug: z.string().trim().min(1), tagline_it: z.string().trim().max(240), description_it: z.string().trim().max(3000),
    address: z.string().trim().max(300), city: z.string().trim().max(120), phone: z.string().trim().max(50), email: z.union([z.email(), z.literal("")]),
    whatsapp_url: z.union([z.url(), z.literal("")]), reservation_url: z.union([z.url(), z.literal("")]), map_url: z.union([z.url(), z.literal("")]), instagram_url: z.union([z.url(), z.literal("")]),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/dashboard/site?error=invalid-site");
  const { id, slug, ...values } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase!.from("locations").update({ ...values, slug: normalizeSlug(slug), email: values.email || null, whatsapp_url: values.whatsapp_url || null, reservation_url: values.reservation_url || null, map_url: values.map_url || null, instagram_url: values.instagram_url || null }).eq("id", id).eq("organization_id", membership.organization_id);
  if (error) redirect("/dashboard/site?error=save-site");
  revalidatePath("/dashboard/site");
  redirect("/dashboard/site?saved=1");
}

export async function saveTheme(formData: FormData) {
  const { membership } = await requireMembership();
  const parsed = z.object({ id: uuid, theme_key: z.enum(["editorial", "minimal"]), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/dashboard/site?error=invalid-theme");
  const supabase = await createClient();
  const { error } = await supabase!.from("themes").update({ theme_key: parsed.data.theme_key, accent: parsed.data.accent }).eq("id", parsed.data.id).eq("organization_id", membership.organization_id);
  if (error) redirect("/dashboard/site?error=save-theme");
  revalidatePath("/dashboard/site");
  redirect("/dashboard/site?saved=1");
}

export async function inviteMember(formData: FormData) {
  const { membership } = await requireMembership();
  if (membership.role !== "owner") redirect("/dashboard/team?error=owner-only");
  const parsed = z.object({ email: z.email(), role: z.enum(["owner", "editor"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/dashboard/team?error=invalid");
  const admin = createAdminClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, { redirectTo: `${origin}/auth/callback?next=/login/reset-password` });
  if (error || !data.user) redirect("/dashboard/team?error=invite");
  const { error: membershipError } = await admin.from("memberships").upsert({ organization_id: membership.organization_id, user_id: data.user.id, role: parsed.data.role }, { onConflict: "organization_id,user_id" });
  if (membershipError) redirect("/dashboard/team?error=membership");
  revalidatePath("/dashboard/team");
  redirect("/dashboard/team?invited=1");
}
