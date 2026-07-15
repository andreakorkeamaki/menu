export const SUPPORTED_LOCALES = ["it", "en", "fr", "de", "es"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type TenantRole = "owner" | "editor";
export type ThemeKey = "editorial" | "minimal";
export type TranslationStatus = "missing" | "machine_draft" | "approved" | "stale" | "error";
export type TranslationOrigin = "machine" | "manual";
export type OnboardingStatus =
  | "materials_missing"
  | "ready"
  | "importing"
  | "review"
  | "awaiting_customer"
  | "published";

export interface Profile {
  id: string;
  full_name: string;
  created_at?: string;
}

export interface Membership {
  id: string;
  organization_id: string;
  user_id: string;
  role: TenantRole;
  organization?: { id: string; name: string; slug: string; status: string };
}

export interface ThemeTokens {
  key: ThemeKey;
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  headingFont: string;
  bodyFont: string;
  radius: string;
}

export interface LocalizedText {
  it: string;
  en?: string;
  fr?: string;
  de?: string;
  es?: string;
}

export interface PublicVariant {
  id: string;
  name: LocalizedText;
  price_delta: number;
}

export interface PublicMenuItem {
  id: string;
  name: LocalizedText;
  description?: LocalizedText;
  ingredients?: LocalizedText;
  price: number;
  available: boolean;
  vegetarian: boolean;
  vegan: boolean;
  gluten_free: boolean;
  allergens: string[];
  image_url?: string | null;
  variants: PublicVariant[];
}

export interface PublicCategory {
  id: string;
  slug: string;
  name: LocalizedText;
  description?: LocalizedText;
  items: PublicMenuItem[];
}

export interface PublicLocation {
  id: string;
  slug: string;
  name: string;
  tagline: LocalizedText;
  description: LocalizedText;
  address: string;
  city: string;
  phone: string;
  email?: string;
  whatsapp_url?: string;
  reservation_url?: string;
  map_url?: string;
  instagram_url?: string;
  opening_hours: Array<{ days: string; hours: string }>;
  logo_url?: string | null;
  cover_url?: string | null;
}

export interface PublicMenuSnapshot {
  schema_version: 1;
  organization_id: string;
  location: PublicLocation;
  menu: {
    id: string;
    name: string;
    currency: "EUR";
    source_locale: "it";
    active_locales: Locale[];
    categories: PublicCategory[];
  };
  theme: ThemeTokens;
  published_at: string;
  version: number;
}

export interface TranslationRow {
  id: string;
  organization_id: string;
  entity_type: "category" | "item" | "variant" | "location";
  entity_id: string;
  locale: Exclude<Locale, "it">;
  field_name: string;
  source_hash: string;
  translated_text: string | null;
  status: TranslationStatus;
  origin: TranslationOrigin;
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; issues?: Record<string, string[]> };
