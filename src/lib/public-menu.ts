import { z } from "zod";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { DEMO_SNAPSHOT } from "@/lib/demo-data";
import { createPublicClient } from "@/lib/supabase/public";
import { reportServerError } from "@/lib/server-telemetry";
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
    name: z.union([z.string(), localizedTextSchema]),
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

export function parsePublicMenuSnapshot(value: unknown): PublicMenuSnapshot | null {
  const parsed = snapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Loads only the immutable current publication. Draft tables are deliberately
 * not part of the public read path.
 */
const loadPublishedMenuFromDatabase = unstable_cache(
  async (locationSlug: string): Promise<PublicMenuSnapshot | null> => {
    const supabase = createPublicClient();
    if (!supabase) return null;

    const { data: publications, error } = await supabase
      .from("menu_publications")
      .select("snapshot")
      .eq("location_slug", locationSlug)
      .eq("is_current", true)
      .limit(1);
    if (error) {
      const reference = reportServerError("public_menu_load_failed", error);
      throw new Error(`Public menu data unavailable. Reference ${reference}.`);
    }

    const rawSnapshot = publications?.[0]?.snapshot;
    const snapshot = parsePublicMenuSnapshot(rawSnapshot);
    if (rawSnapshot && (!snapshot || snapshot.location.slug !== locationSlug)) {
      const reference = reportServerError(
        "public_menu_snapshot_invalid",
        new Error("Current publication snapshot is invalid or has a mismatched slug."),
      );
      throw new Error(`Public menu data unavailable. Reference ${reference}.`);
    }
    if (snapshot) return snapshot;
    return null;
  },
  ["current-public-menu-publication"],
  { revalidate: 3600, tags: ["public-menus"] },
);

async function loadPublishedMenu(locationSlug: string): Promise<PublicMenuSnapshot | null> {
  const snapshot = await loadPublishedMenuFromDatabase(locationSlug);
  if (snapshot) return snapshot;

  return locationSlug === DEMO_SNAPSHOT.location.slug ? DEMO_SNAPSHOT : null;
}

// Metadata and page content share this request-scoped read instead of querying
// the immutable current publication twice during a single render.
export const getPublishedMenu = cache(loadPublishedMenu);

/** Resolve a stable QR code on every visit, so changing the destination does not require reprinting. */
export async function getQrDestinationPath(shortCode: string): Promise<string | null> {
  const normalizedCode = shortCode.trim().toUpperCase();
  const supabase = createPublicClient();

  if (supabase) {
    const { data: codes, error } = await supabase
      .from("qr_codes")
      .select("destination_path")
      .eq("short_code", normalizedCode)
      .eq("is_active", true)
      .limit(1);
    if (error) {
      const reference = reportServerError("public_qr_resolution_failed", error);
      throw new Error(`QR destination unavailable. Reference ${reference}.`);
    }

    const destinationPath = codes?.[0]?.destination_path;
    // QR destinations are deliberately limited to this application's public restaurant routes.
    if (typeof destinationPath === "string" && /^\/r\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/(?:en|fr|de|es))?$/.test(destinationPath)) {
      return destinationPath;
    }
  }

  return normalizedCode === "DEMO01" ? `/r/${DEMO_SNAPSHOT.location.slug}` : null;
}
