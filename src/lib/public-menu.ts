import { z } from "zod";
import { DEMO_SNAPSHOT } from "@/lib/demo-data";
import { createClient } from "@/lib/supabase/server";
import type { PublicMenuSnapshot } from "@/types/domain";

const localizedTextSchema = z.object({
  it: z.string(),
  en: z.string().optional(),
  fr: z.string().optional(),
  de: z.string().optional(),
  es: z.string().optional(),
});

const snapshotSchema = z.object({
  schema_version: z.literal(1),
  organization_id: z.string(),
  location: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    tagline: localizedTextSchema,
    description: localizedTextSchema,
    address: z.string(),
    city: z.string(),
    phone: z.string(),
    email: z.string().optional(),
    whatsapp_url: z.string().url().optional(),
    reservation_url: z.string().url().optional(),
    map_url: z.string().url().optional(),
    instagram_url: z.string().url().optional(),
    opening_hours: z.array(z.object({ days: z.string(), hours: z.string() })),
    logo_url: z.string().url().nullable().optional(),
    cover_url: z.string().url().nullable().optional(),
  }),
  menu: z.object({
    id: z.string(),
    name: z.string(),
    currency: z.literal("EUR"),
    source_locale: z.literal("it"),
    active_locales: z.array(z.enum(["it", "en", "fr", "de", "es"])),
    categories: z.array(
      z.object({
        id: z.string(),
        slug: z.string(),
        name: localizedTextSchema,
        description: localizedTextSchema.optional(),
        items: z.array(
          z.object({
            id: z.string(),
            name: localizedTextSchema,
            description: localizedTextSchema.optional(),
            ingredients: localizedTextSchema.optional(),
            price: z.number().nonnegative(),
            available: z.boolean(),
            vegetarian: z.boolean(),
            vegan: z.boolean(),
            gluten_free: z.boolean(),
            allergens: z.array(z.string()),
            image_url: z.string().url().nullable().optional(),
            variants: z.array(
              z.object({
                id: z.string(),
                name: localizedTextSchema,
                price_delta: z.number(),
              }),
            ),
          }),
        ),
      }),
    ),
  }),
  theme: z.object({
    key: z.enum(["editorial", "minimal"]),
    background: z.string(),
    surface: z.string(),
    text: z.string(),
    muted: z.string(),
    accent: z.string(),
    accentText: z.string(),
    headingFont: z.string(),
    bodyFont: z.string(),
    radius: z.string(),
  }),
  published_at: z.string(),
  version: z.number().int().positive(),
});

function parseSnapshot(value: unknown): PublicMenuSnapshot | null {
  const parsed = snapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Loads only the immutable current publication. Draft tables are deliberately
 * not part of the public read path.
 */
export async function getPublishedMenu(locationSlug: string): Promise<PublicMenuSnapshot | null> {
  const supabase = await createClient();

  if (supabase) {
    const { data: publications } = await supabase
      .from("menu_publications")
      .select("snapshot")
      .eq("location_slug", locationSlug)
      .eq("is_current", true)
      .limit(1);

    const snapshot = parseSnapshot(publications?.[0]?.snapshot);
    if (snapshot && snapshot.location.slug === locationSlug) return snapshot;
  }

  return locationSlug === DEMO_SNAPSHOT.location.slug ? DEMO_SNAPSHOT : null;
}

/** Resolve a stable QR code on every visit, so changing the destination does not require reprinting. */
export async function getQrDestinationPath(shortCode: string): Promise<string | null> {
  const normalizedCode = shortCode.trim().toUpperCase();
  const supabase = await createClient();

  if (supabase) {
    const { data: codes } = await supabase
      .from("qr_codes")
      .select("destination_path")
      .eq("short_code", normalizedCode)
      .eq("is_active", true)
      .limit(1);

    const destinationPath = codes?.[0]?.destination_path;
    // QR destinations are deliberately limited to this application's public restaurant routes.
    if (typeof destinationPath === "string" && /^\/r\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/(?:en|fr|de|es))?$/.test(destinationPath)) {
      return destinationPath;
    }
  }

  return normalizedCode === "DEMO01" ? `/r/${DEMO_SNAPSHOT.location.slug}` : null;
}
