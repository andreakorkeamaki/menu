import { z } from "zod";
import { classifyMenuImportSource } from "@/lib/import/source";

export const MAX_IMPORT_ATTEMPTS = 3;
export const STALLED_IMPORT_MINUTES = 15;

const RetrySourceSchema = z.object({
  storage_bucket: z.literal("intake"),
  filename: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(160),
  parser: z.enum(["csv", "xlsx", "openai"]),
  size_bytes: z.number().int().positive().max(20 * 1024 * 1024),
  openai_file_id: z.string().min(1).max(200).optional(),
}).passthrough();

export const ImportRetryClaimSchema = z.object({
  job_id: z.uuid(),
  organization_id: z.uuid(),
  onboarding_case_id: z.uuid(),
  menu_id: z.uuid(),
  attempt: z.number().int().min(2).max(MAX_IMPORT_ATTEMPTS),
  source_path: z.string().min(1).max(1024),
  source: RetrySourceSchema,
});

export type ImportRetryClaim = z.infer<typeof ImportRetryClaimSchema>;

export function validatedRetrySource(claim: ImportRetryClaim) {
  const classified = classifyMenuImportSource(claim.source.filename);
  if (
    !classified
    || classified.parser !== claim.source.parser
    || classified.mimeType !== claim.source.mime_type
  ) {
    throw new Error("I metadati del file conservato non corrispondono al formato consentito.");
  }
  return classified;
}

export function isImportStalled(status: string, updatedAt: string, now = Date.now()) {
  if (!["pending", "queued", "running"].includes(status)) return false;
  const updated = Date.parse(updatedAt);
  if (!Number.isFinite(updated)) return false;
  return now - updated >= STALLED_IMPORT_MINUTES * 60_000;
}

export function stalledImportCutoff(now = Date.now()) {
  return new Date(now - STALLED_IMPORT_MINUTES * 60_000).toISOString();
}
