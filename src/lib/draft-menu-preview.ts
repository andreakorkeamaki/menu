import type {
  Locale,
  LocalizedText,
  PublicMenuSnapshot,
  ThemeTokens,
  TranslationStatus,
} from "@/types/domain";

interface DraftMenu {
  id: string;
  name: string;
  currency: string;
  source_locale: string;
  active_locales: string[];
  updated_at?: string | null;
}

interface DraftLocation {
  id: string;
  slug: string;
  name: string;
  tagline_it?: string | null;
  description_it?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp_url?: string | null;
  reservation_url?: string | null;
  map_url?: string | null;
  instagram_url?: string | null;
  opening_hours?: unknown;
  logo_url?: string | null;
  cover_url?: string | null;
}

interface DraftTheme {
  theme_key: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accent_text: string;
  heading_font: string;
  body_font: string;
  radius: string;
}

interface DraftCategory {
  id: string;
  slug: string;
  name_it: string;
  description_it?: string | null;
  sort_order: number;
}

interface DraftItem {
  id: string;
  category_id: string;
  name_it: string;
  description_it?: string | null;
  ingredients_it?: string | null;
  price: number | string;
  available: boolean;
  vegetarian: boolean;
  vegan: boolean;
  gluten_free: boolean;
  image_url?: string | null;
  sort_order: number;
}

interface DraftVariant {
  id: string;
  item_id: string;
  name_it: string;
  price_delta: number | string;
  available: boolean;
  sort_order: number;
}

interface DraftAllergen {
  id: string;
  name_it: string;
}

interface DraftItemAllergen {
  item_id: string;
  allergen_id: string;
}

interface DraftTranslation {
  entity_type: "category" | "item" | "variant" | "location";
  entity_id: string;
  field_name: string;
  locale: string;
  translated_text: string | null;
  status: TranslationStatus;
}

export interface DraftMenuPreviewInput {
  organizationId: string;
  menu: DraftMenu;
  location: DraftLocation;
  theme?: DraftTheme | null;
  categories: DraftCategory[];
  items: DraftItem[];
  variants: DraftVariant[];
  allergens: DraftAllergen[];
  itemAllergens: DraftItemAllergen[];
  translations: DraftTranslation[];
}

const localeSet = new Set<Locale>(["it", "en", "fr", "de", "es"]);

const defaultTheme: ThemeTokens = {
  key: "editorial",
  background: "#f4eee4",
  surface: "#fffaf1",
  text: "#24231f",
  muted: "#6d685f",
  accent: "#9d3d2e",
  accentText: "#fffaf1",
  headingFont: "var(--font-serif)",
  bodyFont: "var(--font-sans)",
  radius: "1.5rem",
};

function optional(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function openingHours(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is { days: string; hours: string } => Boolean(
      row
        && typeof row === "object"
        && "days" in row
        && "hours" in row
        && typeof row.days === "string"
        && typeof row.hours === "string",
    ),
  );
}

function localizedText(
  translations: DraftTranslation[],
  entityType: DraftTranslation["entity_type"],
  entityId: string,
  fieldName: string,
  source: string | null | undefined,
): LocalizedText {
  const result: LocalizedText = { it: source ?? "" };
  for (const translation of translations) {
    if (
      translation.status !== "approved"
      || translation.entity_type !== entityType
      || translation.entity_id !== entityId
      || translation.field_name !== fieldName
      || !translation.translated_text
      || translation.locale === "it"
      || !localeSet.has(translation.locale as Locale)
    ) continue;
    result[translation.locale as Exclude<Locale, "it">] = translation.translated_text;
  }
  return result;
}

function previewTheme(theme: DraftTheme | null | undefined): ThemeTokens {
  if (!theme) return defaultTheme;
  return {
    key: theme.theme_key === "minimal" ? "minimal" : "editorial",
    background: theme.background,
    surface: theme.surface,
    text: theme.text,
    muted: theme.muted,
    accent: theme.accent,
    accentText: theme.accent_text,
    headingFont: theme.heading_font,
    bodyFont: theme.body_font,
    radius: theme.radius,
  };
}

export function buildDraftMenuPreview(input: DraftMenuPreviewInput): PublicMenuSnapshot {
  const activeLocales = input.menu.active_locales.filter(
    (locale): locale is Locale => localeSet.has(locale as Locale),
  );
  if (!activeLocales.includes("it")) activeLocales.unshift("it");
  const allergenNames = new Map(input.allergens.map((allergen) => [allergen.id, allergen.name_it]));
  const allergensByItem = new Map<string, string[]>();
  for (const relation of input.itemAllergens) {
    const name = allergenNames.get(relation.allergen_id);
    if (!name) continue;
    allergensByItem.set(relation.item_id, [...(allergensByItem.get(relation.item_id) ?? []), name]);
  }

  const categories = [...input.categories]
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .map((category) => ({
      id: category.id,
      slug: category.slug,
      name: localizedText(input.translations, "category", category.id, "name", category.name_it),
      ...(optional(category.description_it) ? {
        description: localizedText(input.translations, "category", category.id, "description", category.description_it),
      } : {}),
      items: input.items
        .filter((item) => item.category_id === category.id)
        .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
        .map((item) => ({
          id: item.id,
          name: localizedText(input.translations, "item", item.id, "name", item.name_it),
          ...(optional(item.description_it) ? {
            description: localizedText(input.translations, "item", item.id, "description", item.description_it),
          } : {}),
          ...(optional(item.ingredients_it) ? {
            ingredients: localizedText(input.translations, "item", item.id, "ingredients", item.ingredients_it),
          } : {}),
          price: Number(item.price),
          available: item.available,
          vegetarian: item.vegetarian,
          vegan: item.vegan,
          gluten_free: item.gluten_free,
          allergens: [...(allergensByItem.get(item.id) ?? [])].sort((a, b) => a.localeCompare(b, "it")),
          image_url: item.image_url ?? null,
          variants: input.variants
            .filter((variant) => variant.item_id === item.id && variant.available)
            .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
            .map((variant) => ({
              id: variant.id,
              name: localizedText(input.translations, "variant", variant.id, "name", variant.name_it),
              price_delta: Number(variant.price_delta),
            })),
        })),
    }));

  return {
    schema_version: 1,
    organization_id: input.organizationId,
    location: {
      id: input.location.id,
      slug: input.location.slug,
      name: input.location.name,
      tagline: localizedText(input.translations, "location", input.location.id, "tagline", input.location.tagline_it),
      description: localizedText(input.translations, "location", input.location.id, "description", input.location.description_it),
      address: input.location.address ?? "",
      city: input.location.city ?? "",
      phone: input.location.phone ?? "",
      ...(optional(input.location.email) ? { email: optional(input.location.email) } : {}),
      ...(optional(input.location.whatsapp_url) ? { whatsapp_url: optional(input.location.whatsapp_url) } : {}),
      ...(optional(input.location.reservation_url) ? { reservation_url: optional(input.location.reservation_url) } : {}),
      ...(optional(input.location.map_url) ? { map_url: optional(input.location.map_url) } : {}),
      ...(optional(input.location.instagram_url) ? { instagram_url: optional(input.location.instagram_url) } : {}),
      opening_hours: openingHours(input.location.opening_hours),
      logo_url: input.location.logo_url ?? null,
      cover_url: input.location.cover_url ?? null,
    },
    menu: {
      id: input.menu.id,
      name: input.menu.name,
      currency: "EUR",
      source_locale: "it",
      active_locales: activeLocales,
      categories,
    },
    theme: previewTheme(input.theme),
    published_at: input.menu.updated_at ?? new Date(0).toISOString(),
    version: 1,
  };
}
