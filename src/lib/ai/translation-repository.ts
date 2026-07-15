import type { SupabaseClient } from "@supabase/supabase-js";
import { MENU_TRANSLATION_PROMPT_VERSION } from "@/lib/ai/menu-translation";
import { sourceHash } from "@/lib/ai/source-hash";
import type {
  TargetLocale,
  TranslationBatchRepository,
  TranslationCandidate,
  TranslationWrite,
} from "@/lib/ai/translation-batch";

interface TranslationRowData {
  id: string;
  organization_id: string;
  entity_type: TranslationCandidate["entityType"];
  entity_id: string;
  field_name: string;
  locale: TargetLocale;
  status: TranslationCandidate["status"];
  origin: TranslationCandidate["origin"];
  source_hash: string;
}

const ELIGIBLE_STATUSES = ["missing", "stale", "error"] as const;

export function translationSourceKey(entityType: string, entityId: string, fieldName: string) {
  return `${entityType}:${entityId}:${fieldName}`;
}

export async function loadTranslationSourceMap(
  client: SupabaseClient,
  organizationId: string,
  rows: Array<Pick<TranslationCandidate, "entityType" | "entityId" | "fieldName">>,
) {
  const idsFor = (entityType: TranslationCandidate["entityType"]) => [
    ...new Set(
      rows
        .filter((row) => row.entityType === entityType)
        .map((row) => row.entityId),
    ),
  ];
  const locationIds = idsFor("location");
  const categoryIds = idsFor("category");
  const itemIds = idsFor("item");
  const variantIds = idsFor("variant");

  const [locations, categories, items, variants] = await Promise.all([
    locationIds.length
      ? client
          .from("locations")
          .select("id,tagline_it,description_it")
          .eq("organization_id", organizationId)
          .in("id", locationIds)
      : Promise.resolve({ data: [], error: null }),
    categoryIds.length
      ? client
          .from("menu_categories")
          .select("id,name_it,description_it")
          .eq("organization_id", organizationId)
          .in("id", categoryIds)
      : Promise.resolve({ data: [], error: null }),
    itemIds.length
      ? client
          .from("menu_items")
          .select("id,name_it,description_it,ingredients_it")
          .eq("organization_id", organizationId)
          .in("id", itemIds)
      : Promise.resolve({ data: [], error: null }),
    variantIds.length
      ? client
          .from("item_variants")
          .select("id,name_it")
          .eq("organization_id", organizationId)
          .in("id", variantIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const firstError = [locations.error, categories.error, items.error, variants.error].find(
    Boolean,
  );
  if (firstError) {
    throw new Error(`Lettura testi sorgente non riuscita: ${firstError.message}`);
  }

  const sources = new Map<string, string>();
  for (const row of locations.data ?? []) {
    sources.set(translationSourceKey("location", row.id, "tagline"), row.tagline_it ?? "");
    sources.set(
      translationSourceKey("location", row.id, "description"),
      row.description_it ?? "",
    );
  }
  for (const row of categories.data ?? []) {
    sources.set(translationSourceKey("category", row.id, "name"), row.name_it ?? "");
    sources.set(
      translationSourceKey("category", row.id, "description"),
      row.description_it ?? "",
    );
  }
  for (const row of items.data ?? []) {
    sources.set(translationSourceKey("item", row.id, "name"), row.name_it ?? "");
    sources.set(
      translationSourceKey("item", row.id, "description"),
      row.description_it ?? "",
    );
    sources.set(
      translationSourceKey("item", row.id, "ingredients"),
      row.ingredients_it ?? "",
    );
  }
  for (const row of variants.data ?? []) {
    sources.set(translationSourceKey("variant", row.id, "name"), row.name_it ?? "");
  }
  return sources;
}

export async function loadTranslationCandidates(
  client: SupabaseClient,
  organizationId: string,
  limit = 200,
) {
  const { data, error } = await client
    .from("translations")
    .select(
      "id,organization_id,entity_type,entity_id,field_name,locale,status,origin,source_hash",
    )
    .eq("organization_id", organizationId)
    .in("status", [...ELIGIBLE_STATUSES])
    .eq("origin", "machine")
    .order("locale")
    .order("updated_at")
    .limit(limit);
  if (error) throw new Error(`Lettura coda traduzioni non riuscita: ${error.message}`);

  const rows = (data ?? []) as TranslationRowData[];
  const sourceMap = await loadTranslationSourceMap(
    client,
    organizationId,
    rows.map((row) => ({
      entityType: row.entity_type,
      entityId: row.entity_id,
      fieldName: row.field_name,
    })),
  );
  return rows.map(
    (row): TranslationCandidate => ({
      id: row.id,
      organizationId: row.organization_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      fieldName: row.field_name,
      locale: row.locale,
      status: row.status,
      origin: row.origin,
      storedSourceHash: row.source_hash,
      sourceText:
        sourceMap.get(translationSourceKey(row.entity_type, row.entity_id, row.field_name)) ?? "",
    }),
  );
}

export function createTranslationBatchRepository(
  userClient: SupabaseClient,
  adminClient: SupabaseClient,
): TranslationBatchRepository {
  return {
    async findRunningJob(organizationId, requestKey) {
      const { data, error } = await adminClient
        .from("ai_jobs")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("kind", "translation")
        .contains("input", { request_key: requestKey })
        .in("status", ["pending", "queued", "running"])
        .gte(
          "created_at",
          new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        )
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Verifica job traduzione non riuscita: ${error.message}`);
      return data?.id ?? null;
    },

    async createJob(input) {
      const { data, error } = await adminClient
        .from("ai_jobs")
        .insert({
          organization_id: input.organizationId,
          kind: "translation",
          job_type: "translation",
          model: input.model,
          prompt_version: MENU_TRANSLATION_PROMPT_VERSION,
          status: "running",
          attempts: 1,
          input: {
            locale: input.locale,
            request_key: input.requestKey,
            translation_ids: input.candidateIds,
            source_hashes: input.sourceHashes,
          },
          started_at: new Date().toISOString(),
          created_by: input.userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Creazione job traduzione non riuscita: ${error.message}`);
      return data.id as string;
    },

    async saveDrafts(organizationId, locale, writes) {
      const beforeSave = await loadTranslationSourceMap(
        userClient,
        organizationId,
        writes.map(({ candidate }) => candidate),
      );
      let saved = 0;
      let skipped = 0;
      const savedWrites: TranslationWrite[] = [];

      for (const write of writes) {
        const currentSource = beforeSave.get(
          translationSourceKey(
            write.candidate.entityType,
            write.candidate.entityId,
            write.candidate.fieldName,
          ),
        );
        if (currentSource === undefined || sourceHash(currentSource) !== write.sourceHash) {
          skipped += 1;
          continue;
        }

        const { data, error } = await userClient
          .from("translations")
          .update({
            translated_text: write.translatedText,
            source_hash: write.sourceHash,
            status: "machine_draft",
            origin: "machine",
            approved_by: null,
            approved_at: null,
          })
          .eq("id", write.candidate.id)
          .eq("organization_id", organizationId)
          .eq("locale", locale)
          .eq("origin", "machine")
          .in("status", [...ELIGIBLE_STATUSES])
          .select("id")
          .maybeSingle();
        if (error) throw new Error(`Salvataggio traduzione non riuscito: ${error.message}`);
        if (data) {
          saved += 1;
          savedWrites.push(write);
        } else {
          skipped += 1;
        }
      }

      // Repair the narrow race where source text changes immediately after the pre-save check.
      if (savedWrites.length) {
        const afterSave = await loadTranslationSourceMap(
          userClient,
          organizationId,
          savedWrites.map(({ candidate }) => candidate),
        );
        for (const write of savedWrites) {
          const currentSource = afterSave.get(
            translationSourceKey(
              write.candidate.entityType,
              write.candidate.entityId,
              write.candidate.fieldName,
            ),
          );
          if (currentSource !== undefined && sourceHash(currentSource) === write.sourceHash) {
            continue;
          }
          const { error } = await userClient
            .from("translations")
            .update({ status: "stale", approved_by: null, approved_at: null })
            .eq("id", write.candidate.id)
            .eq("organization_id", organizationId)
            .eq("origin", "machine")
            .eq("status", "machine_draft")
            .eq("source_hash", write.sourceHash);
          if (error) throw new Error(`Ripristino freshness non riuscito: ${error.message}`);
        }
      }
      return { saved, skipped };
    },

    async completeJob(input) {
      const { error } = await adminClient
        .from("ai_jobs")
        .update({
          response_id: input.responseId,
          status: "review",
          usage: input.usage,
          output: input.output,
          error: null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", input.jobId);
      if (error) throw new Error(`Chiusura job traduzione non riuscita: ${error.message}`);
    },

    async failJob(jobId, message) {
      const { error } = await adminClient
        .from("ai_jobs")
        .update({
          status: "failed",
          error: { message },
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      if (error) throw new Error(`Salvataggio errore traduzione non riuscito: ${error.message}`);
    },
  };
}
