import type { Locale, ThemeTokens } from "@/types/domain";

export const APP_NAME = "MenuInterattivo";
export const SOURCE_LOCALE: Locale = "it";
export const ACTIVE_LOCALES: Locale[] = ["it", "en", "fr", "de", "es"];
export const MAX_ACTIVE_LOCALES = 6;

export const LOCALE_LABELS: Record<Locale, string> = {
  it: "Italiano",
  en: "English",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
};

export const THEMES: Record<"editorial" | "minimal", ThemeTokens> = {
  editorial: {
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
  },
  minimal: {
    key: "minimal",
    background: "#f4f6f3",
    surface: "#ffffff",
    text: "#16211b",
    muted: "#637067",
    accent: "#1f6a4f",
    accentText: "#ffffff",
    headingFont: "var(--font-sans)",
    bodyFont: "var(--font-sans)",
    radius: "0.75rem",
  },
};
