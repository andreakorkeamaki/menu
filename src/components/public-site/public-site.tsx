import type { CSSProperties } from "react";
import Link from "next/link";
import { localized } from "@/lib/format";
import { safeHttpUrl } from "@/lib/safe-url";
import { resolveAccessibleAccentPalette, resolveAccessibleTextColor } from "@/lib/color-contrast";
import type { Locale, PublicMenuSnapshot } from "@/types/domain";
import { PUBLIC_COPY } from "./copy";
import { LanguageSwitcher } from "./language-switcher";
import { MenuBrowser } from "./menu-browser";
import { localizeOpeningDays, localizedMenuName } from "./localization";

interface PublicSiteProps {
  snapshot: PublicMenuSnapshot;
  locale: Locale;
  preview?: { basePath: string; pendingTranslations?: number };
}

type ThemeStyle = CSSProperties & Record<`--public-${string}`, string>;

function themeStyle(snapshot: PublicMenuSnapshot): ThemeStyle {
  const accessibleAccent = resolveAccessibleAccentPalette({
    accent: snapshot.theme.accent,
    background: snapshot.theme.background,
    surface: snapshot.theme.surface,
  });
  const accessibleText = resolveAccessibleTextColor({
    text: snapshot.theme.text,
    background: snapshot.theme.background,
    surface: snapshot.theme.surface,
  });
  return {
    "--public-bg": snapshot.theme.background,
    "--public-surface": snapshot.theme.surface,
    "--public-text": accessibleText.text,
    "--public-muted": snapshot.theme.muted,
    "--public-accent": accessibleAccent.accent,
    "--public-accent-text": accessibleAccent.accentText,
    "--public-heading": snapshot.theme.headingFont,
    "--public-body": snapshot.theme.bodyFont,
    "--public-radius": snapshot.theme.radius,
  };
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function PublicSite({ snapshot, locale, preview }: PublicSiteProps) {
  const { location, menu } = snapshot;
  const copy = PUBLIC_COPY[locale];
  const reservationUrl = safeHttpUrl(location.reservation_url);
  const mapUrl = safeHttpUrl(location.map_url);
  const whatsappUrl = safeHttpUrl(location.whatsapp_url);
  const instagramUrl = safeHttpUrl(location.instagram_url);
  const homeHref = preview
    ? `${preview.basePath}?locale=${locale}`
    : locale === "it" ? `/r/${location.slug}` : `/r/${location.slug}/${locale}`;
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
    acceptsReservations: Boolean(reservationUrl),
    ...(instagramUrl ? { sameAs: [instagramUrl] } : {}),
  };

  return (
    <div className="public-site" data-theme={snapshot.theme.key} lang={locale} style={themeStyle(snapshot)}>
      {!preview ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJson(restaurantJsonLd) }} /> : null}

      {preview ? (
        <aside className="draft-preview-toolbar" aria-label="Anteprima privata">
          <div><span>Bozza privata</span><strong>{preview.pendingTranslations ? `${preview.pendingTranslations} testi in ${locale.toUpperCase()} non sono approvati` : "Questa versione non è online"}</strong><small>{preview.pendingTranslations ? "Le parti mancanti ricadono sull’italiano: completa la coda prima di pubblicare." : "Controlla aspetto, lingua e interazioni prima di pubblicare."}</small></div>
          <Link href="/dashboard/menu/review">Chiudi anteprima</Link>
        </aside>
      ) : null}

      <header className="public-header">
        <Link className="public-brand" href={homeHref}>
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
          {reservationUrl ? (
            <a className="public-button public-button-small" href={reservationUrl} rel="noreferrer">
              {copy.reserve}
            </a>
          ) : null}
        </nav>
      </header>

      <main>
        <section className="public-hero" aria-labelledby="restaurant-name">
          <div className="public-hero-media">
            {location.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="public-hero-image" src={location.cover_url} alt="" fetchPriority="high" />
            ) : (
              <div className="public-hero-art" aria-hidden="true">
                <div className="public-art-plate">
                  <span>{location.name.slice(0, 1)}</span>
                </div>
                <p>{location.city}</p>
              </div>
            )}
            <div className="public-hero-stamp" aria-hidden="true">
              <span>Cucina</span>
              <strong>{location.city}</strong>
              <i>↘</i>
            </div>
          </div>
          <div className="public-hero-copy">
            <div className="public-hero-topline">
              <p>{location.city}</p>
              <LanguageSwitcher locationSlug={location.slug} locale={locale} locales={menu.active_locales} previewBasePath={preview?.basePath} />
            </div>
            <h1 id="restaurant-name">{location.name}</h1>
            <p className="public-tagline">{localized(location.tagline, locale)}</p>
            <p className="public-description">{localized(location.description, locale)}</p>
            <div className="public-hero-actions">
              <a className="public-button" href="#menu">{copy.navMenu}</a>
              {reservationUrl ? (
                <a className="public-text-link" href={reservationUrl} rel="noreferrer">
                  {copy.reserve} <span aria-hidden="true">↗</span>
                </a>
              ) : null}
            </div>
            <p className="public-hero-note" aria-hidden="true">Scorri per scegliere ·</p>
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
            {mapUrl ? (
              <a className="public-text-link" href={mapUrl} rel="noreferrer">
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
              {whatsappUrl ? <li><a href={whatsappUrl} rel="noreferrer">{copy.whatsapp}</a></li> : null}
              {instagramUrl ? <li><a href={instagramUrl} rel="noreferrer">{copy.instagram}</a></li> : null}
            </ul>
          </div>
        </section>
      </main>

      <footer className="public-footer">
        <p><strong>{location.name}</strong> · {location.city}</p>
        <p>{preview ? "Anteprima bozza · non pubblicata" : `${copy.publishedMenu} · v${snapshot.version}`}</p>
      </footer>

      <nav className="public-mobile-actions" aria-label={copy.mobileNavigation}>
        <a href="#menu">{copy.navMenu}</a>
        {reservationUrl ? (
          <a className="is-primary" href={reservationUrl} rel="noreferrer">{copy.reserve}</a>
        ) : (
          <a className="is-primary" href="#info">{copy.navInfo}</a>
        )}
      </nav>
    </div>
  );
}
