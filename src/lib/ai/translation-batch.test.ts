import { describe, expect, it, vi } from "vitest";
import {
  runTranslationBatch,
  translationRequestKey,
  type TranslationBatchRepository,
  type TranslationCandidate,
  type TargetLocale,
} from "@/lib/ai/translation-batch";
import type { TranslationRequest } from "@/lib/ai/menu-translation";

function candidate(
  id: string,
  locale: "en" | "fr" = "en",
  overrides: Partial<TranslationCandidate> = {},
): TranslationCandidate {
  return {
    id,
    organizationId: "org-1",
    entityType: "item",
    entityId: `item-${id}`,
    fieldName: "name",
    locale,
    status: "stale",
    origin: "machine",
    sourceText: `Piatto ${id}`,
    storedSourceHash: "old-hash",
    ...overrides,
  };
}

function repository(existingJob: string | null = null) {
  return {
    findRunningJob: vi.fn(async () => existingJob),
    createJob: vi.fn(async () => "job-1"),
    saveDrafts: vi.fn(async (_organizationId, _locale, writes) => ({
      saved: writes.length,
      skipped: 0,
    })),
    completeJob: vi.fn(async () => undefined),
    failJob: vi.fn(async () => undefined),
  } satisfies TranslationBatchRepository;
}

function translated(locale: TargetLocale, ids: string[]) {
  return {
    drafts: {
      source_locale: "it" as const,
      target_locale: locale,
      translations: ids.map((id) => ({
        key: id,
        translated_text: `Translated ${id}`,
        confidence: { score: 1, notes: null },
        issues: [],
      })),
      issues: [],
    },
    responseId: `resp-${locale}`,
    usage: { total_tokens: 10 },
    model: "gpt-5.6-luna",
  };
}

describe("runTranslationBatch", () => {
  it("translates only machine-owned missing, stale or error rows grouped by locale", async () => {
    const repo = repository();
    const translate = vi.fn(async (request: TranslationRequest) =>
      translated(
        request.target_locale,
        request.entries.map((entry) => entry.key),
      ),
    );
    const candidates = [
      candidate("en-1"),
      candidate("fr-1", "fr", { status: "missing" }),
      candidate("manual", "en", { origin: "manual" }),
      candidate("approved", "en", { status: "approved" }),
      candidate("draft", "en", { status: "machine_draft" }),
    ];

    const results = await runTranslationBatch({
      organizationId: "org-1",
      userId: "user-1",
      candidates,
      repository: repo,
      translate,
    });

    expect(results).toHaveLength(2);
    expect(translate).toHaveBeenCalledTimes(2);
    expect(repo.saveDrafts).toHaveBeenCalledTimes(2);
    expect(repo.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "en",
        candidateIds: ["en-1"],
        model: "gpt-5.6-luna",
      }),
    );
  });

  it("deduplicates a locale while the same request key is running", async () => {
    const repo = repository("job-running");
    const translate = vi.fn();
    const row = candidate("en-1");
    const results = await runTranslationBatch({
      organizationId: "org-1",
      userId: "user-1",
      candidates: [row],
      repository: repo,
      translate,
    });

    expect(repo.findRunningJob).toHaveBeenCalledWith(
      "org-1",
      translationRequestKey("org-1", "en", [row]),
    );
    expect(results[0].deduplicated).toBe(true);
    expect(translate).not.toHaveBeenCalled();
    expect(repo.createJob).not.toHaveBeenCalled();
  });

  it("records a failed job without calling the save adapter", async () => {
    const repo = repository();
    const results = await runTranslationBatch({
      organizationId: "org-1",
      userId: "user-1",
      candidates: [candidate("en-1")],
      repository: repo,
      translate: vi.fn(async () => {
        throw new Error("provider unavailable");
      }),
    });

    expect(repo.failJob).toHaveBeenCalledWith("job-1", "provider unavailable");
    expect(repo.saveDrafts).not.toHaveBeenCalled();
    expect(results[0].error).toBe("provider unavailable");
  });
});
