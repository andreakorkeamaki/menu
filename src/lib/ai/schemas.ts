import { z } from "zod";

export const ConfidenceSchema = z
  .object({
    score: z.number().min(0).max(1),
    notes: z.string().nullable(),
  })
  .strict();

export const ImportIssueSchema = z
  .object({
    code: z.enum([
      "missing_value",
      "invalid_value",
      "ambiguous_value",
      "duplicate_value",
      "unsupported_value",
      "source_parse_error",
    ]),
    severity: z.enum(["info", "warning", "error"]),
    path: z.string(),
    message: z.string(),
    original_value: z.string().nullable(),
  })
  .strict();

export const StagedAllergenSchema = z
  .object({
    code: z.string().min(1),
    name: z.string().min(1),
    confidence: ConfidenceSchema,
    issues: z.array(ImportIssueSchema),
  })
  .strict();

export const StagedVariantSchema = z
  .object({
    name: z.string().min(1),
    price_delta: z.number().nullable(),
    available: z.boolean().nullable(),
    allergens: z.array(StagedAllergenSchema),
    confidence: ConfidenceSchema,
    issues: z.array(ImportIssueSchema),
  })
  .strict();

export const StagedMenuItemSchema = z
  .object({
    source_id: z.string().nullable(),
    name: z.string().min(1),
    description: z.string().nullable(),
    ingredients: z.string().nullable(),
    price: z.number().nonnegative().nullable(),
    available: z.boolean().nullable(),
    vegetarian: z.boolean().nullable(),
    vegan: z.boolean().nullable(),
    gluten_free: z.boolean().nullable(),
    allergens: z.array(StagedAllergenSchema),
    variants: z.array(StagedVariantSchema),
    confidence: ConfidenceSchema,
    issues: z.array(ImportIssueSchema),
  })
  .strict();

export const StagedCategorySchema = z
  .object({
    name: z.string().min(1),
    description: z.string().nullable(),
    position: z.number().int().nonnegative(),
    items: z.array(StagedMenuItemSchema),
    confidence: ConfidenceSchema,
    issues: z.array(ImportIssueSchema),
  })
  .strict();

export const MenuImportStagingSchema = z
  .object({
    menu_name: z.string().min(1),
    source_locale: z.literal("it"),
    currency: z.literal("EUR"),
    categories: z.array(StagedCategorySchema),
    confidence: ConfidenceSchema,
    issues: z.array(ImportIssueSchema),
  })
  .strict();

export const TranslationDraftSchema = z
  .object({
    key: z.string().min(1),
    translated_text: z.string().min(1),
    confidence: ConfidenceSchema,
    issues: z.array(ImportIssueSchema),
  })
  .strict();

export const TranslationDraftsSchema = z
  .object({
    source_locale: z.literal("it"),
    target_locale: z.enum(["en", "fr", "de", "es"]),
    translations: z.array(TranslationDraftSchema),
    issues: z.array(ImportIssueSchema),
  })
  .strict();

export type Confidence = z.infer<typeof ConfidenceSchema>;
export type ImportIssue = z.infer<typeof ImportIssueSchema>;
export type StagedAllergen = z.infer<typeof StagedAllergenSchema>;
export type StagedVariant = z.infer<typeof StagedVariantSchema>;
export type StagedMenuItem = z.infer<typeof StagedMenuItemSchema>;
export type StagedCategory = z.infer<typeof StagedCategorySchema>;
export type MenuImportStaging = z.infer<typeof MenuImportStagingSchema>;
export type TranslationDrafts = z.infer<typeof TranslationDraftsSchema>;

export function validateMenuImportStaging(value: unknown) {
  const parsed = MenuImportStagingSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `Importazione non valida: ${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}
