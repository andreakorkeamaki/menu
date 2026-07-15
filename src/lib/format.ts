import type { Locale, LocalizedText } from "@/types/domain";

export function formatCurrency(value: number, locale: Locale = "it") {
  return new Intl.NumberFormat(locale === "it" ? "it-IT" : locale, {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function localized(text: LocalizedText | undefined, locale: Locale) {
  if (!text) return "";
  return text[locale] || text.it;
}

export function formatDateTime(value: string, locale: Locale = "it") {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
