import type { Metadata } from "next";
import { buildPublicMetadata, PublicPageContent } from "@/components/public-site/page-content";

interface PublicLocationPageProps {
  params: Promise<{ locationSlug: string }>;
}

export async function generateMetadata({ params }: PublicLocationPageProps): Promise<Metadata> {
  const { locationSlug } = await params;
  return buildPublicMetadata(locationSlug, "it");
}

export default async function PublicLocationPage({ params }: PublicLocationPageProps) {
  const { locationSlug } = await params;
  return <PublicPageContent locationSlug={locationSlug} locale="it" />;
}
