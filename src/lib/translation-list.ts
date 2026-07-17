import type { Locale, TranslationStatus } from "@/types/domain";

export type TranslationLocaleFilter = Exclude<Locale, "it"> | null;
export type TranslationStatusFilter = "attention" | "all" | TranslationStatus;

const localeFilters: Array<Exclude<Locale, "it">> = ["en", "fr", "de", "es"];
const statusFilters: TranslationStatusFilter[] = [
  "attention", "all", "missing", "machine_draft", "approved", "stale", "error",
];

export function parseTranslationListParams(input: {
  locale?: string;
  status?: string;
  page?: string;
}) {
  const locale = localeFilters.includes(input.locale as Exclude<Locale, "it">)
    ? input.locale as Exclude<Locale, "it">
    : null;
  const status = statusFilters.includes(input.status as TranslationStatusFilter)
    ? input.status as TranslationStatusFilter
    : "attention";
  const parsedPage = /^\d+$/.test(input.page ?? "") ? Number(input.page) : 1;
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  return { locale, status, page };
}

export function translationListHref({
  locale,
  status,
  page,
}: {
  locale: TranslationLocaleFilter;
  status: TranslationStatusFilter;
  page: number;
}) {
  const query = new URLSearchParams();
  if (locale) query.set("locale", locale);
  if (status !== "attention") query.set("status", status);
  if (page > 1) query.set("page", String(page));
  const suffix = query.toString();
  return suffix ? `/dashboard/translations?${suffix}` : "/dashboard/translations";
}
