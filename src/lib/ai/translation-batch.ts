import { sourceHash } from "@/lib/ai/source-hash";
import { getAiModelSettings } from "@/lib/ai/config";
import {
  createTranslationDrafts,
  MENU_TRANSLATION_PROMPT_VERSION,
  type TranslationRequest,
} from "@/lib/ai/menu-translation";
import type { ImportIssue, Confidence } from "@/lib/ai/schemas";

export type TargetLocale = "en" | "fr" | "de" | "es";
export type EligibleTranslationStatus = "missing" | "stale" | "error";

export interface TranslationCandidate {
  id: string;
  organizationId: string;
  entityType: "category" | "item" | "variant" | "location";
  entityId: string;
  fieldName: string;
  locale: TargetLocale;
  status: EligibleTranslationStatus | "machine_draft" | "approved";
  origin: "machine" | "manual";
  sourceText: string;
  storedSourceHash: string;
}

export interface TranslationWrite {
  candidate: TranslationCandidate;
  translatedText: string;
  sourceHash: string;
  confidence: Confidence;
  issues: ImportIssue[];
}

export interface TranslationBatchRepository {
  findRunningJob(organizationId: string, requestKey: string): Promise<string | null>;
  createJob(input: {
    organizationId: string;
    userId: string;
    locale: TargetLocale;
    requestKey: string;
    candidateIds: string[];
    sourceHashes: Record<string, string>;
    model: string;
  }): Promise<string>;
  saveDrafts(
    organizationId: string,
    locale: TargetLocale,
    writes: TranslationWrite[],
  ): Promise<{ saved: number; skipped: number }>;
  completeJob(input: {
    jobId: string;
    responseId: string;
    usage: unknown;
    output: unknown;
  }): Promise<void>;
  failJob(jobId: string, message: string): Promise<void>;
}

export interface TranslationDraftServiceResult {
  drafts: Awaited<ReturnType<typeof createTranslationDrafts>>["drafts"];
  responseId: string;
  usage: unknown;
  model: string;
}

export interface RunTranslationBatchInput {
  organizationId: string;
  userId: string;
  candidates: TranslationCandidate[];
  repository: TranslationBatchRepository;
  translate?: (
    request: TranslationRequest,
  ) => Promise<TranslationDraftServiceResult>;
}

export interface TranslationLocaleResult {
  locale: TargetLocale;
  requested: number;
  saved: number;
  skipped: number;
  deduplicated: boolean;
  error: string | null;
}

const ELIGIBLE_STATUSES = new Set<TranslationCandidate["status"]>([
  "missing",
  "stale",
  "error",
]);

export function isMachineTranslationCandidate(
  candidate: TranslationCandidate,
): candidate is TranslationCandidate & { status: EligibleTranslationStatus; origin: "machine" } {
  return (
    candidate.organizationId.length > 0 &&
    candidate.sourceText.trim().length > 0 &&
    candidate.origin === "machine" &&
    ELIGIBLE_STATUSES.has(candidate.status)
  );
}

export function translationRequestKey(
  organizationId: string,
  locale: TargetLocale,
  candidates: TranslationCandidate[],
) {
  const stableEntries = [...candidates]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((candidate) => ({
      id: candidate.id,
      source_hash: sourceHash(candidate.sourceText),
    }));
  return sourceHash(JSON.stringify({ organizationId, locale, stableEntries }));
}

export async function runTranslationBatch({
  organizationId,
  userId,
  candidates,
  repository,
  translate = (request) => createTranslationDrafts(request),
}: RunTranslationBatchInput) {
  const eligible = candidates.filter(
    (candidate) =>
      candidate.organizationId === organizationId &&
      isMachineTranslationCandidate(candidate),
  );
  const locales: TargetLocale[] = ["en", "fr", "de", "es"];
  const results: TranslationLocaleResult[] = [];

  for (const locale of locales) {
    const localeCandidates = eligible
      .filter((candidate) => candidate.locale === locale)
      .sort((left, right) => left.id.localeCompare(right.id));
    if (!localeCandidates.length) continue;

    const requestKey = translationRequestKey(
      organizationId,
      locale,
      localeCandidates,
    );
    const runningJobId = await repository.findRunningJob(
      organizationId,
      requestKey,
    );
    if (runningJobId) {
      results.push({
        locale,
        requested: localeCandidates.length,
        saved: 0,
        skipped: localeCandidates.length,
        deduplicated: true,
        error: null,
      });
      continue;
    }

    let jobId: string | null = null;
    try {
      const sourceHashes = Object.fromEntries(
        localeCandidates.map((candidate) => [
          candidate.id,
          sourceHash(candidate.sourceText),
        ]),
      );
      const settings = getAiModelSettings("translation");
      jobId = await repository.createJob({
        organizationId,
        userId,
        locale,
        requestKey,
        candidateIds: localeCandidates.map((candidate) => candidate.id),
        sourceHashes,
        model: settings.model,
      });

      const translated = await translate({
        source_locale: "it",
        target_locale: locale,
        entries: localeCandidates.map((candidate) => ({
          key: candidate.id,
          source_text: candidate.sourceText,
          context: `${candidate.entityType}.${candidate.fieldName}`,
        })),
      });
      const candidatesById = new Map(
        localeCandidates.map((candidate) => [candidate.id, candidate]),
      );
      const writes = translated.drafts.translations.map((draft) => ({
        candidate: candidatesById.get(draft.key)!,
        translatedText: draft.translated_text,
        sourceHash: sourceHashes[draft.key],
        confidence: draft.confidence,
        issues: draft.issues,
      }));
      const saved = await repository.saveDrafts(
        organizationId,
        locale,
        writes,
      );
      await repository.completeJob({
        jobId,
        responseId: translated.responseId,
        usage: translated.usage,
        output: {
          prompt_version: MENU_TRANSLATION_PROMPT_VERSION,
          locale,
          requested: localeCandidates.length,
          saved: saved.saved,
          skipped: saved.skipped,
          drafts: translated.drafts,
        },
      });
      results.push({
        locale,
        requested: localeCandidates.length,
        saved: saved.saved,
        skipped: saved.skipped,
        deduplicated: false,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore traduzione sconosciuto.";
      if (jobId) await repository.failJob(jobId, message);
      results.push({
        locale,
        requested: localeCandidates.length,
        saved: 0,
        skipped: localeCandidates.length,
        deduplicated: false,
        error: message,
      });
    }
  }

  return results;
}
