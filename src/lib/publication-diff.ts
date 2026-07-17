import { formatCurrency } from "@/lib/format";
import type { PublicCategory, PublicMenuItem, PublicMenuSnapshot } from "@/types/domain";

export type PublicationChangeKind = "added" | "removed" | "updated";

export interface PublicationChange {
  kind: PublicationChangeKind;
  label: string;
  detail: string;
}

export interface PublicationDiff {
  firstPublication: boolean;
  hasChanges: boolean;
  addedItems: number;
  removedItems: number;
  updatedItems: number;
  categoryChanges: number;
  siteAndStyleChanges: number;
  totalChanges: number;
  draftCategoryCount: number;
  draftItemCount: number;
  changes: PublicationChange[];
}

interface IndexedItem {
  item: PublicMenuItem;
  category: PublicCategory;
  itemIndex: number;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

function equal(left: unknown, right: unknown) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function itemIndex(snapshot: PublicMenuSnapshot) {
  const result = new Map<string, IndexedItem>();
  for (const category of snapshot.menu.categories) {
    category.items.forEach((item, itemIndex) => result.set(item.id, { item, category, itemIndex }));
  }
  return result;
}

function categoryName(category: PublicCategory) {
  return category.name.it || "Categoria senza nome";
}

function changedItemDetails(previous: IndexedItem, next: IndexedItem) {
  const details: string[] = [];
  if (!equal(previous.item.name, next.item.name)) details.push("nome o traduzioni");
  if (!equal(previous.item.description, next.item.description)) details.push("descrizione o traduzioni");
  if (!equal(previous.item.ingredients, next.item.ingredients)) details.push("ingredienti o traduzioni");
  if (previous.item.price !== next.item.price) {
    details.push(`prezzo ${formatCurrency(previous.item.price)} → ${formatCurrency(next.item.price)}`);
  }
  if (previous.item.available !== next.item.available) {
    details.push(next.item.available ? "ora disponibile" : "ora non disponibile");
  }
  if (
    previous.item.vegetarian !== next.item.vegetarian
    || previous.item.vegan !== next.item.vegan
    || previous.item.gluten_free !== next.item.gluten_free
  ) details.push("indicazioni alimentari");
  if (!equal([...previous.item.allergens].sort(), [...next.item.allergens].sort())) details.push("allergeni");
  if (!equal(previous.item.variants, next.item.variants)) details.push("varianti");
  if ((previous.item.image_url ?? null) !== (next.item.image_url ?? null)) details.push("foto");
  if (previous.category.id !== next.category.id) {
    details.push(`spostato in ${categoryName(next.category)}`);
  } else if (previous.itemIndex !== next.itemIndex) {
    details.push("ordine nella categoria");
  }
  return details;
}

function changedCategoryDetails(
  previous: PublicCategory,
  next: PublicCategory,
  previousIndex: number,
  nextIndex: number,
) {
  const details: string[] = [];
  if (!equal(previous.name, next.name)) details.push("nome o traduzioni");
  if (!equal(previous.description, next.description)) details.push("descrizione o traduzioni");
  if (previous.slug !== next.slug) details.push("slug");
  if (previousIndex !== nextIndex) details.push("ordine nel menu");
  return details;
}

const locationFields: Array<[keyof PublicMenuSnapshot["location"], string]> = [
  ["slug", "indirizzo pubblico"],
  ["name", "nome"],
  ["tagline", "frase di apertura o traduzioni"],
  ["description", "descrizione o traduzioni"],
  ["address", "indirizzo"],
  ["city", "città"],
  ["phone", "telefono"],
  ["email", "email"],
  ["whatsapp_url", "WhatsApp"],
  ["reservation_url", "prenotazioni"],
  ["map_url", "mappa"],
  ["instagram_url", "Instagram"],
  ["opening_hours", "orari"],
  ["logo_url", "logo"],
  ["cover_url", "copertina"],
];

export function buildPublicationDiff(
  current: PublicMenuSnapshot | null,
  draft: PublicMenuSnapshot,
): PublicationDiff {
  const draftItemCount = draft.menu.categories.reduce((count, category) => count + category.items.length, 0);
  if (!current) {
    return {
      firstPublication: true,
      hasChanges: true,
      addedItems: draftItemCount,
      removedItems: 0,
      updatedItems: 0,
      categoryChanges: draft.menu.categories.length,
      siteAndStyleChanges: 1,
      totalChanges: draftItemCount + draft.menu.categories.length + 1,
      draftCategoryCount: draft.menu.categories.length,
      draftItemCount,
      changes: [],
    };
  }

  const changes: PublicationChange[] = [];
  const previousItems = itemIndex(current);
  const nextItems = itemIndex(draft);
  let addedItems = 0;
  let removedItems = 0;
  let updatedItems = 0;

  for (const [id, next] of nextItems) {
    const previous = previousItems.get(id);
    if (!previous) {
      addedItems += 1;
      changes.push({
        kind: "added",
        label: next.item.name.it,
        detail: `Nuovo piatto in ${categoryName(next.category)}`,
      });
      continue;
    }
    const details = changedItemDetails(previous, next);
    if (details.length) {
      updatedItems += 1;
      changes.push({ kind: "updated", label: next.item.name.it, detail: details.join(" · ") });
    }
  }
  for (const [id, previous] of previousItems) {
    if (nextItems.has(id)) continue;
    removedItems += 1;
    changes.push({
      kind: "removed",
      label: previous.item.name.it,
      detail: `Rimosso da ${categoryName(previous.category)}`,
    });
  }

  const previousCategories = new Map(current.menu.categories.map((category, index) => [category.id, { category, index }]));
  const nextCategories = new Map(draft.menu.categories.map((category, index) => [category.id, { category, index }]));
  let categoryChanges = 0;
  for (const [id, next] of nextCategories) {
    const previous = previousCategories.get(id);
    if (!previous) {
      categoryChanges += 1;
      changes.push({ kind: "added", label: categoryName(next.category), detail: "Nuova categoria" });
      continue;
    }
    const details = changedCategoryDetails(previous.category, next.category, previous.index, next.index);
    if (details.length) {
      categoryChanges += 1;
      changes.push({ kind: "updated", label: categoryName(next.category), detail: details.join(" · ") });
    }
  }
  for (const [id, previous] of previousCategories) {
    if (nextCategories.has(id)) continue;
    categoryChanges += 1;
    changes.push({ kind: "removed", label: categoryName(previous.category), detail: "Categoria rimossa" });
  }

  let siteAndStyleChanges = 0;
  const changedLocationFields = locationFields
    .filter(([field]) => !equal(current.location[field], draft.location[field]))
    .map(([, label]) => label);
  if (changedLocationFields.length) {
    siteAndStyleChanges += 1;
    changes.push({
      kind: "updated",
      label: "Sito del ristorante",
      detail: changedLocationFields.join(" · "),
    });
  }
  if (!equal(current.theme, draft.theme)) {
    siteAndStyleChanges += 1;
    changes.push({ kind: "updated", label: "Aspetto del sito", detail: "Tema, colori o tipografia" });
  }
  if (!equal(current.menu.active_locales, draft.menu.active_locales)) {
    siteAndStyleChanges += 1;
    changes.push({
      kind: "updated",
      label: "Lingue pubblicate",
      detail: `${current.menu.active_locales.map((locale) => locale.toUpperCase()).join(" · ")} → ${draft.menu.active_locales.map((locale) => locale.toUpperCase()).join(" · ")}`,
    });
  }
  if (!equal(current.menu.name, draft.menu.name)) {
    siteAndStyleChanges += 1;
    changes.push({ kind: "updated", label: "Nome del menu", detail: "Testo o traduzioni" });
  }

  const totalChanges = addedItems + removedItems + updatedItems + categoryChanges + siteAndStyleChanges;
  return {
    firstPublication: false,
    hasChanges: totalChanges > 0,
    addedItems,
    removedItems,
    updatedItems,
    categoryChanges,
    siteAndStyleChanges,
    totalChanges,
    draftCategoryCount: draft.menu.categories.length,
    draftItemCount,
    changes,
  };
}
