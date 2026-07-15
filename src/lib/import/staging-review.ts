import {
  MenuImportStagingSchema,
  type ImportIssue,
  type MenuImportStaging,
} from "@/lib/ai/schemas";

type StagingParser = "openai" | "csv" | "xlsx" | string;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeAllergen(value: unknown, parser: StagingParser) {
  const allergen = record(value);
  if (!allergen) return value;
  const origin = allergen.origin === "document" || allergen.origin === "ai_inferred"
    ? allergen.origin
    : parser === "openai" ? "ai_inferred" : "document";
  return {
    ...allergen,
    origin,
    evidence: typeof allergen.evidence === "string" ? allergen.evidence : null,
    confirmed: typeof allergen.confirmed === "boolean"
      ? allergen.confirmed
      : origin === "document" ? true : null,
  };
}

/** Upgrades staging created before allergen provenance was introduced. */
export function normalizeMenuImportStaging(value: unknown, parser: StagingParser) {
  const staging = record(value);
  if (!staging) return MenuImportStagingSchema.parse(value);
  const categories = Array.isArray(staging.categories) ? staging.categories.map((categoryValue) => {
    const category = record(categoryValue);
    if (!category) return categoryValue;
    const items = Array.isArray(category.items) ? category.items.map((itemValue) => {
      const item = record(itemValue);
      if (!item) return itemValue;
      const variants = Array.isArray(item.variants) ? item.variants.map((variantValue) => {
        const variant = record(variantValue);
        if (!variant) return variantValue;
        return {
          ...variant,
          allergens: Array.isArray(variant.allergens)
            ? variant.allergens.map((allergen) => normalizeAllergen(allergen, parser))
            : variant.allergens,
        };
      }) : item.variants;
      return {
        ...item,
        allergens: Array.isArray(item.allergens)
          ? item.allergens.map((allergen) => normalizeAllergen(allergen, parser))
          : item.allergens,
        variants,
      };
    }) : category.items;
    return { ...category, items };
  }) : staging.categories;
  return MenuImportStagingSchema.parse({ ...staging, categories });
}

export function isActionableIssue(issue: ImportIssue) {
  if (issue.severity === "error") return true;
  if (issue.severity === "info") return false;
  if (issue.code !== "missing_value") return true;
  return /(?:^|\.)(?:name|price|price_delta)$/.test(issue.path);
}

export function getStagingReviewSummary(staging: MenuImportStaging) {
  let pendingAllergens = 0;
  let missingPrices = 0;
  let missingVariantDeltas = 0;
  let blockingIssues = 0;
  let actionableIssues = 0;

  const countIssues = (issues: ImportIssue[]) => {
    blockingIssues += issues.filter((issue) => issue.severity === "error").length;
    actionableIssues += issues.filter(isActionableIssue).length;
  };

  countIssues(staging.issues);
  for (const category of staging.categories) {
    countIssues(category.issues);
    for (const item of category.items) {
      if (item.price === null) missingPrices += 1;
      pendingAllergens += item.allergens.filter(
        (allergen) => allergen.origin === "ai_inferred" && allergen.confirmed === null,
      ).length;
      countIssues(item.issues);
      item.allergens.forEach((allergen) => countIssues(allergen.issues));
      for (const variant of item.variants) {
        if (variant.price_delta === null) missingVariantDeltas += 1;
        pendingAllergens += variant.allergens.filter(
          (allergen) => allergen.origin === "ai_inferred" && allergen.confirmed === null,
        ).length;
        countIssues(variant.issues);
        variant.allergens.forEach((allergen) => countIssues(allergen.issues));
      }
    }
  }

  return {
    pendingAllergens,
    missingPrices,
    missingVariantDeltas,
    blockingIssues,
    actionableIssues,
    requiredDecisions: pendingAllergens + missingPrices + missingVariantDeltas + blockingIssues,
  };
}

function rejectedAllergenIssue(path: string, name: string): ImportIssue {
  return {
    code: "unsupported_value",
    severity: "info",
    path,
    message: `Suggerimento allergene AI rifiutato dall'operatore: ${name}.`,
    original_value: name,
  };
}

/** Removes rejected suggestions from publishable data while retaining an audit note. */
export function prepareReviewedStagingForSave(staging: MenuImportStaging) {
  const next = structuredClone(staging);
  next.categories.forEach((category, categoryIndex) => {
    category.items.forEach((item, itemIndex) => {
      const itemPath = `categories[${categoryIndex}].items[${itemIndex}]`;
      const rejectedItemAllergens = item.allergens.filter((allergen) => allergen.confirmed === false);
      item.allergens = item.allergens.filter((allergen) => allergen.confirmed !== false);
      rejectedItemAllergens.forEach((allergen) => {
        item.issues.push(rejectedAllergenIssue(`${itemPath}.allergens`, allergen.name));
      });
      item.variants.forEach((variant, variantIndex) => {
        const rejectedVariantAllergens = variant.allergens.filter(
          (allergen) => allergen.confirmed === false,
        );
        variant.allergens = variant.allergens.filter((allergen) => allergen.confirmed !== false);
        rejectedVariantAllergens.forEach((allergen) => {
          variant.issues.push(rejectedAllergenIssue(
            `${itemPath}.variants[${variantIndex}].allergens`,
            allergen.name,
          ));
        });
      });
    });
  });
  return next;
}
