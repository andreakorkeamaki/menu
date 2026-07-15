import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedMenu } from "@/lib/public-menu";
import { localized } from "@/lib/format";
import { SUPPORTED_LOCALES, type Locale } from "@/types/domain";
import { PublicSite } from "./public-site";

export function isLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.some((locale) => locale === value);
}

export async function buildPublicMetadata(locationSlug: string, locale: Locale): Promise<Metadata> {
  const snapshot = await getPublishedMenu(locationSlug);
  if (!snapshot || !snapshot.menu.active_locales.includes(locale)) return {};

  const title = `${snapshot.location.name} — ${snapshot.menu.name}`;
  const description = localized(snapshot.location.description, locale);
  const canonical = locale === "it" ? `/r/${locationSlug}` : `/r/${locationSlug}/${locale}`;

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: Object.fromEntries(
        snapshot.menu.active_locales.map((activeLocale) => [
          activeLocale,
          activeLocale === "it" ? `/r/${locationSlug}` : `/r/${locationSlug}/${activeLocale}`,
        ]),
      ),
    },
    openGraph: {
      type: "website",
      title,
      description,
      ...(snapshot.location.cover_url ? { images: [snapshot.location.cover_url] } : {}),
      locale,
    },
  };
}

export async function PublicPageContent({ locationSlug, locale }: { locationSlug: string; locale: Locale }) {
  const snapshot = await getPublishedMenu(locationSlug);
  if (!snapshot || !snapshot.menu.active_locales.includes(locale)) notFound();

  return <PublicSite snapshot={snapshot} locale={locale} />;
}
