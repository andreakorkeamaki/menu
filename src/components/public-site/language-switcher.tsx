import Link from "next/link";
import { LOCALE_LABELS } from "@/lib/constants";
import type { Locale } from "@/types/domain";
import { PUBLIC_COPY } from "./copy";

interface LanguageSwitcherProps {
  locationSlug: string;
  locale: Locale;
  locales: Locale[];
}

export function LanguageSwitcher({ locationSlug, locale, locales }: LanguageSwitcherProps) {
  return (
    <nav className="public-language" aria-label={PUBLIC_COPY[locale].language}>
      <span className="sr-only">{PUBLIC_COPY[locale].language}</span>
      {locales.map((option) => (
        <Link
          key={option}
          href={option === "it" ? `/r/${locationSlug}` : `/r/${locationSlug}/${option}`}
          hrefLang={option}
          lang={option}
          aria-current={option === locale ? "page" : undefined}
          title={LOCALE_LABELS[option]}
        >
          {option.toUpperCase()}
        </Link>
      ))}
    </nav>
  );
}
