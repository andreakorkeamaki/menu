import type { CSSProperties } from "react";
import Link from "next/link";
import { localized } from "@/lib/format";
import type { Locale, PublicMenuSnapshot } from "@/types/domain";
import { PUBLIC_COPY } from "./copy";
import { LanguageSwitcher } from "./language-switcher";
import { MenuBrowser } from "./menu-browser";
import { localizeOpeningDays, localizedMenuName } from "./localization";

interface PublicSiteProps {
  snapshot: PublicMenuSnapshot;
  locale: Locale;
}

type ThemeStyle = CSSProperties & Record<`--public-${string}`, string>;

function themeStyle(snapshot: PublicMenuSnapshot): ThemeStyle {
  return {
    "--public-bg": snapshot.theme.background,
    "--public-surface": snapshot.theme.surface,
    "--public-text": snapshot.theme.text,
    "--public-muted": snapshot.theme.muted,
    "--public-accent": snapshot.theme.accent,
    "--public-accent-text": snapshot.theme.accentText,
    "--public-heading": snapshot.theme.headingFont,
    "--public-body": snapshot.theme.bodyFont,
    "--public-radius": snapshot.theme.radius,
  };
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function PublicSite({ snapshot, locale }: PublicSiteProps) {
  const { location, menu } = snapshot;
  const copy = PUBLIC_COPY[locale];
  const restaurantJsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: location.name,
    description: localized(location.description, locale),
    ...(location.cover_url ? { image: location.cover_url } : {}),
    address: {
      "@type": "PostalAddress",
      streetAddress: location.address,
      addressLocality: location.city,
      addressCountry: "IT",
    },
    telephone: location.phone,
    ...(location.email ? { email: location.email } : {}),
    servesCuisine: "Italian",
    priceRange: "€€",
    hasMenu: locale === "it" ? `/r/${location.slug}` : `/r/${location.slug}/${locale}`,
    acceptsReservations: Boolean(location.reservation_url),
    ...(location.instagram_url ? { sameAs: [location.instagram_url] } : {}),
  };

  return (
    <div className="public-site" data-theme={snapshot.theme.key} lang={locale} style={themeStyle(snapshot)}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJson(restaurantJsonLd) }} />

      <header className="public-header">
        <Link className="public-brand" href={locale === "it" ? `/r/${location.slug}` : `/r/${location.slug}/${locale}`}>
          {location.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={location.logo_url} alt={location.name} />
          ) : (
            <span aria-hidden="true">{location.name.slice(0, 1)}</span>
          )}
          <strong>{location.name}</strong>
        </Link>
        <nav className="public-main-nav" aria-label={copy.mainNavigation}>
          <a href="#menu">{copy.navMenu}</a>
          <a href="#info">{copy.navInfo}</a>
          {location.reservation_url ? (
            <a className="public-button public-button-small" href={location.reservation_url} rel="noreferrer">
              {copy.reserve}
            </a>
          ) : null}
        </nav>
      </header>

      <main>
        <section className="public-hero" aria-labelledby="restaurant-name">
          {location.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="public-hero-image" src={location.cover_url} alt="" fetchPriority="high" />
          ) : (
            <div className="public-hero-art" aria-hidden="true">
              <span>MI</span>
            </div>
          )}
          <div className="public-hero-copy">
            <div className="public-hero-topline">
              <p>{location.city}</p>
              <LanguageSwitcher locationSlug={location.slug} locale={locale} locales={menu.active_locales} />
            </div>
            <h1 id="restaurant-name">{location.name}</h1>
            <p className="public-tagline">{localized(location.tagline, locale)}</p>
            <p className="public-description">{localized(location.description, locale)}</p>
            <div className="public-hero-actions">
              <a className="public-button" href="#menu">{copy.navMenu}</a>
              {location.reservation_url ? (
                <a className="public-text-link" href={location.reservation_url} rel="noreferrer">
                  {copy.reserve} <span aria-hidden="true">↗</span>
                </a>
              ) : null}
            </div>
          </div>
        </section>

        <section className="public-menu-section" id="menu" aria-labelledby="menu-title">
          <div className="public-section-heading">
            <p>{copy.menuEyebrow}</p>
            <h2 id="menu-title">{localizedMenuName(menu.name, locale)}</h2>
          </div>
          <MenuBrowser categories={menu.categories} locale={locale} />
        </section>

        <section className="public-info-section" id="info" aria-labelledby="info-title">
          <div className="public-info-intro">
            <p>{location.city}</p>
            <h2 id="info-title">{copy.information}</h2>
            <address>
              {location.address}<br />
              {location.city}
            </address>
            {location.map_url ? (
              <a className="public-text-link" href={location.map_url} rel="noreferrer">
                {copy.directions} <span aria-hidden="true">↗</span>
              </a>
            ) : null}
          </div>

          <div className="public-info-card">
            <h3>{copy.hours}</h3>
            <dl>
              {location.opening_hours.map((row) => (
                <div key={`${row.days}-${row.hours}`}>
                  <dt>{localizeOpeningDays(row.days, locale)}</dt>
                  <dd>{row.hours}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="public-info-card">
            <h3>{copy.contacts}</h3>
            <ul>
              <li><a href={`tel:${location.phone.replace(/\s/g, "")}`}>{location.phone}</a></li>
              {location.email ? <li><a href={`mailto:${location.email}`}>{location.email}</a></li> : null}
              {location.whatsapp_url ? <li><a href={location.whatsapp_url} rel="noreferrer">{copy.whatsapp}</a></li> : null}
              {location.instagram_url ? <li><a href={location.instagram_url} rel="noreferrer">{copy.instagram}</a></li> : null}
            </ul>
          </div>
        </section>
      </main>

      <footer className="public-footer">
        <p><strong>{location.name}</strong> · {location.city}</p>
        <p>{copy.publishedMenu} · v{snapshot.version}</p>
      </footer>
    </div>
  );
}
