import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildPublicMetadata, isLocale, PublicPageContent } from "@/components/public-site/page-content";

interface LocalizedPublicLocationPageProps {
  params: Promise<{ locationSlug: string; locale: string }>;
}

export async function generateMetadata({ params }: LocalizedPublicLocationPageProps): Promise<Metadata> {
  const { locationSlug, locale } = await params;
  return isLocale(locale) ? buildPublicMetadata(locationSlug, locale) : {};
}

export default async function LocalizedPublicLocationPage({ params }: LocalizedPublicLocationPageProps) {
  const { locationSlug, locale } = await params;
  if (!isLocale(locale) || locale === "it") notFound();

  return <PublicPageContent locationSlug={locationSlug} locale={locale} />;
}
