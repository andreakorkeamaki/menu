"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { formatCurrency, localized } from "@/lib/format";
import type { Locale, PublicCategory } from "@/types/domain";
import { PUBLIC_COPY } from "./copy";
import { localizeAllergen } from "./localization";

interface MenuBrowserProps {
  categories: PublicCategory[];
  locale: Locale;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

export function MenuBrowser({ categories, locale }: MenuBrowserProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const copy = PUBLIC_COPY[locale];

  const visibleCategories = useMemo(() => {
    const needle = normalize(deferredQuery.trim());
    if (!needle) return categories;

    return categories
      .map((category) => ({
        ...category,
        items: category.items.filter((item) =>
          normalize(
            [
              localized(item.name, locale),
              localized(item.description, locale),
              localized(item.ingredients, locale),
              ...item.allergens.flatMap((allergen) => [allergen, localizeAllergen(allergen, locale)]),
            ].join(" "),
          ).includes(needle),
        ),
      }))
      .filter((category) => category.items.length > 0);
  }, [categories, deferredQuery, locale]);

  return (
    <div className="public-menu-browser">
      <div className="public-search">
        <label htmlFor="menu-search">{copy.searchLabel}</label>
        <div className="public-search-field">
          <span aria-hidden="true">⌕</span>
          <input
            id="menu-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
            autoComplete="off"
          />
        </div>
      </div>

      {!deferredQuery && categories.length > 1 ? (
        <nav className="public-category-nav" aria-label={copy.navMenu}>
          {categories.map((category) => (
            <a key={category.id} href={`#category-${category.slug}`}>
              {localized(category.name, locale)}
            </a>
          ))}
        </nav>
      ) : null}

      <div className="public-categories" aria-live="polite">
        {visibleCategories.length === 0 ? (
          <p className="public-empty">{copy.noResults}</p>
        ) : (
          visibleCategories.map((category) => (
            <section className="public-category" id={`category-${category.slug}`} key={category.id}>
              <header>
                <p>{String(category.items.length).padStart(2, "0")}</p>
                <div>
                  <h3>{localized(category.name, locale)}</h3>
                  {category.description ? <span>{localized(category.description, locale)}</span> : null}
                </div>
              </header>

              <div className="public-item-list">
                {category.items.map((item) => (
                  <article className={`public-menu-item${item.available ? "" : " is-unavailable"}`} key={item.id}>
                    {item.image_url ? (
                      // Snapshot media URLs are approved public assets. Native img avoids external-host config coupling.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image_url} alt="" loading="lazy" />
                    ) : null}
                    <div className="public-item-content">
                      <div className="public-item-title">
                        <h4>{localized(item.name, locale)}</h4>
                        <span>{formatCurrency(item.price, locale)}</span>
                      </div>
                      {item.description ? <p>{localized(item.description, locale)}</p> : null}
                      {item.ingredients ? (
                        <p className="public-item-detail">
                          <strong>{copy.ingredients}:</strong> {localized(item.ingredients, locale)}
                        </p>
                      ) : null}
                      <div className="public-item-meta">
                        {!item.available ? <span className="public-status">{copy.unavailable}</span> : null}
                        {item.vegetarian ? <span>{copy.vegetarian}</span> : null}
                        {item.vegan ? <span>{copy.vegan}</span> : null}
                        {item.gluten_free ? <span>{copy.glutenFree}</span> : null}
                      </div>
                      {item.allergens.length > 0 ? (
                        <p className="public-allergens">
                          <strong>{copy.allergens}:</strong> {item.allergens.map((allergen) => localizeAllergen(allergen, locale)).join(", ")}
                        </p>
                      ) : null}
                      {item.variants.length > 0 ? (
                        <ul className="public-variants">
                          {item.variants.map((variant) => (
                            <li key={variant.id}>
                              <span>{localized(variant.name, locale)}</span>
                              <span>+ {formatCurrency(variant.price_delta, locale)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
