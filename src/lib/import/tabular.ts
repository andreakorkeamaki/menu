import {
  MenuImportStagingSchema,
  type Confidence,
  type ImportIssue,
  type MenuImportStaging,
  type StagedAllergen,
  type StagedMenuItem,
  type StagedVariant,
} from "@/lib/ai/schemas";

export type TabularRow = Record<string, unknown>;

const COLUMNS = {
  menuName: ["menu", "menu_name", "nome_menu"],
  category: ["category", "categoria", "sezione"],
  categoryDescription: [
    "category_description",
    "descrizione_categoria",
    "descrizione_sezione",
  ],
  sourceId: ["source_id", "id", "codice", "sku"],
  itemName: ["name", "nome", "piatto", "prodotto", "voce"],
  description: ["description", "descrizione"],
  ingredients: ["ingredients", "ingredienti"],
  price: ["price", "prezzo", "prezzo_eur"],
  available: ["available", "disponibile", "disponibilita"],
  vegetarian: ["vegetarian", "vegetariano"],
  vegan: ["vegan", "vegano"],
  glutenFree: ["gluten_free", "senza_glutine", "glutenfree"],
  allergens: ["allergens", "allergeni"],
  variants: ["variant", "variants", "variante", "varianti", "formato"],
  variantPriceDelta: [
    "variant_price_delta",
    "variant_delta",
    "supplemento_variante",
    "prezzo_variante",
  ],
} as const;

const ALLERGEN_CODES: Record<string, string> = {
  glutine: "gluten",
  gluten: "gluten",
  crostacei: "crustaceans",
  crustaceans: "crustaceans",
  uova: "eggs",
  eggs: "eggs",
  pesce: "fish",
  fish: "fish",
  arachidi: "peanuts",
  peanuts: "peanuts",
  soia: "soybeans",
  soy: "soybeans",
  soybeans: "soybeans",
  latte: "milk",
  milk: "milk",
  frutta_a_guscio: "nuts",
  frutta_con_guscio: "nuts",
  nuts: "nuts",
  sedano: "celery",
  celery: "celery",
  senape: "mustard",
  mustard: "mustard",
  sesamo: "sesame",
  sesame: "sesame",
  solfiti: "sulphites",
  solfito: "sulphites",
  sulphites: "sulphites",
  lupini: "lupin",
  lupin: "lupin",
  molluschi: "molluscs",
  molluscs: "molluscs",
};

export function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function valueFor(row: TabularRow, aliases: readonly string[]) {
  for (const alias of aliases) {
    const value = row[alias];
    if (text(value)) return text(value);
  }
  return "";
}

export function parseLocalizedNumber(value: unknown): number | null {
  let normalized = text(value)
    .replace(/[€$£]/g, "")
    .replace(/\s/g, "");
  if (!normalized) return null;

  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    normalized =
      comma > dot
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized.replace(/,/g, "");
  } else if (comma >= 0) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if ((normalized.match(/\./g) ?? []).length > 1) {
    normalized = normalized.replace(/\./g, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseLocalizedBoolean(value: unknown): boolean | null {
  const normalized = normalizeHeader(text(value));
  if (!normalized) return null;
  if (["1", "true", "si", "s", "yes", "y", "disponibile"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "non_disponibile"].includes(normalized)) {
    return false;
  }
  return null;
}

function confidence(issues: ImportIssue[]): Confidence {
  if (issues.some((issue) => issue.severity === "error")) {
    return { score: 0.4, notes: "Sono presenti errori da correggere." };
  }
  if (issues.some((issue) => issue.severity === "warning")) {
    return { score: 0.75, notes: "Sono presenti valori da verificare." };
  }
  return { score: 1, notes: null };
}

function issue(
  code: ImportIssue["code"],
  severity: ImportIssue["severity"],
  path: string,
  message: string,
  originalValue: string | null = null,
): ImportIssue {
  return {
    code,
    severity,
    path,
    message,
    original_value: originalValue,
  };
}

function splitList(value: string) {
  return value
    .split(/[|;,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseAllergens(value: string, path: string): StagedAllergen[] {
  return splitList(value).map((name, index) => {
    const normalizedName = normalizeHeader(name);
    const knownCode = ALLERGEN_CODES[normalizedName];
    const issues = knownCode
      ? []
      : [
          issue(
            "unsupported_value",
            "warning",
            `${path}[${index}]`,
            "Allergene non riconosciuto: verificare il codice prima dell'approvazione.",
            name,
          ),
        ];

    return {
      code: knownCode ?? (normalizedName || `allergen_${index + 1}`),
      name,
      origin: "document" as const,
      evidence: name,
      confirmed: true,
      confidence: confidence(issues),
      issues,
    };
  });
}

function parseVariants(
  namesValue: string,
  deltasValue: string,
  path: string,
): StagedVariant[] {
  const names = splitList(namesValue);
  const deltas = splitList(deltasValue);

  return names.map((name, index) => {
    const issues: ImportIssue[] = [];
    const originalDelta = deltas[index] ?? "";
    const priceDelta = parseLocalizedNumber(originalDelta);
    if (originalDelta && priceDelta === null) {
      issues.push(
        issue(
          "invalid_value",
          "warning",
          `${path}[${index}].price_delta`,
          "Supplemento variante non numerico.",
          originalDelta,
        ),
      );
    }

    return {
      name,
      price_delta: priceDelta,
      available: null,
      allergens: [],
      confidence: confidence(issues),
      issues,
    };
  });
}

function parseItem(row: TabularRow, path: string, rowNumber: number): StagedMenuItem {
  const issues: ImportIssue[] = [];
  const originalName = valueFor(row, COLUMNS.itemName);
  const name = originalName || `Voce senza nome (riga ${rowNumber})`;
  if (!originalName) {
    issues.push(
      issue(
        "missing_value",
        "error",
        `${path}.name`,
        "Nome del piatto mancante.",
      ),
    );
  }

  const originalPrice = valueFor(row, COLUMNS.price);
  let price = parseLocalizedNumber(originalPrice);
  if (!originalPrice) {
    issues.push(
      issue(
        "missing_value",
        "warning",
        `${path}.price`,
        "Prezzo mancante.",
      ),
    );
  } else if (price === null || price < 0) {
    issues.push(
      issue(
        "invalid_value",
        "error",
        `${path}.price`,
        "Prezzo non valido.",
        originalPrice,
      ),
    );
    price = null;
  }

  const allergens = parseAllergens(
    valueFor(row, COLUMNS.allergens),
    `${path}.allergens`,
  );
  const variants = parseVariants(
    valueFor(row, COLUMNS.variants),
    valueFor(row, COLUMNS.variantPriceDelta),
    `${path}.variants`,
  );

  return {
    source_id: valueFor(row, COLUMNS.sourceId) || null,
    name,
    description: valueFor(row, COLUMNS.description) || null,
    ingredients: valueFor(row, COLUMNS.ingredients) || null,
    price,
    available: parseLocalizedBoolean(valueFor(row, COLUMNS.available)),
    vegetarian: parseLocalizedBoolean(valueFor(row, COLUMNS.vegetarian)),
    vegan: parseLocalizedBoolean(valueFor(row, COLUMNS.vegan)),
    gluten_free: parseLocalizedBoolean(valueFor(row, COLUMNS.glutenFree)),
    allergens,
    variants,
    confidence: confidence([
      ...issues,
      ...allergens.flatMap((allergen) => allergen.issues),
      ...variants.flatMap((variant) => variant.issues),
    ]),
    issues,
  };
}

export interface RowsToStagingOptions {
  menuName?: string;
  sourceIssues?: ImportIssue[];
}

export function rowsToMenuStaging(
  rows: TabularRow[],
  options: RowsToStagingOptions = {},
): MenuImportStaging {
  const sourceIssues = [...(options.sourceIssues ?? [])];
  const normalizedRows = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]),
    ),
  );
  const menuName =
    options.menuName ??
    normalizedRows.map((row) => valueFor(row, COLUMNS.menuName)).find(Boolean) ??
    "Menu importato";

  const categoryMap = new Map<
    string,
    { description: string | null; rows: Array<{ row: TabularRow; rowNumber: number }> }
  >();

  normalizedRows.forEach((row, index) => {
    const categoryName = valueFor(row, COLUMNS.category) || "Menu";
    const current = categoryMap.get(categoryName) ?? {
      description: valueFor(row, COLUMNS.categoryDescription) || null,
      rows: [],
    };
    current.rows.push({ row, rowNumber: index + 2 });
    categoryMap.set(categoryName, current);
  });

  if (normalizedRows.length === 0) {
    sourceIssues.push(
      issue(
        "missing_value",
        "error",
        "categories",
        "Il file non contiene righe dati.",
      ),
    );
  }

  const categories = [...categoryMap.entries()].map(
    ([name, category], categoryIndex) => {
      const categoryIssues: ImportIssue[] = [];
      const items = category.rows.map(({ row, rowNumber }, itemIndex) =>
        parseItem(
          row,
          `categories[${categoryIndex}].items[${itemIndex}]`,
          rowNumber,
        ),
      );
      const seenItems = new Set<string>();
      items.forEach((item, itemIndex) => {
        const hasSourceId = Boolean(item.source_id);
        const identity = hasSourceId
          ? `source:${item.source_id!.trim().toLocaleLowerCase("en-US")}`
          : `name:${normalizeHeader(item.name)}`;
        if (seenItems.has(identity)) {
          item.issues.push(
            issue(
              "duplicate_value",
              hasSourceId ? "error" : "warning",
              `categories[${categoryIndex}].items[${itemIndex}]`,
              hasSourceId
                ? "Identificativo sorgente duplicato nella categoria: correggere o rimuovere la riga."
                : "Nome piatto duplicato nella categoria: verificare che siano due voci distinte.",
              item.source_id ?? item.name,
            ),
          );
          item.confidence = confidence([
            ...item.issues,
            ...item.allergens.flatMap((allergen) => allergen.issues),
            ...item.variants.flatMap((variant) => variant.issues),
          ]);
        } else {
          seenItems.add(identity);
        }
      });
      return {
        name,
        description: category.description,
        position: categoryIndex,
        items,
        confidence: confidence([
          ...categoryIssues,
          ...items.flatMap((item) => item.issues),
        ]),
        issues: categoryIssues,
      };
    },
  );

  return MenuImportStagingSchema.parse({
    menu_name: menuName,
    source_locale: "it",
    currency: "EUR",
    categories,
    confidence: confidence([
      ...sourceIssues,
      ...categories.flatMap((category) => category.issues),
      ...categories.flatMap((category) =>
        category.items.flatMap((item) => item.issues),
      ),
    ]),
    issues: sourceIssues,
  });
}

export function sourceParseIssue(message: string, originalValue?: string): ImportIssue {
  return issue(
    "source_parse_error",
    "warning",
    "source",
    message,
    originalValue ?? null,
  );
}
