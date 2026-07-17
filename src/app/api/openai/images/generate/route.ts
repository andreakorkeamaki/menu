import OpenAI from "openai";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createMenuImage,
  MENU_IMAGE_COMPRESSION,
  MENU_IMAGE_FORMAT,
  MenuImageInstructionsSchema,
  MENU_IMAGE_PROMPT_VERSION,
  MENU_IMAGE_QUALITY,
  MENU_IMAGE_SIZE,
  MenuImageQualitySchema,
  menuImagePrompt,
  menuImageSourceFromItem,
  menuImageSourceHash,
} from "@/lib/ai/menu-image";
import { getImageModel } from "@/lib/ai/config";
import { sourceHash } from "@/lib/ai/source-hash";
import {
  BRAND_MEDIA_MAX_BYTES,
  detectBrandImageMime,
  menuItemMediaObjectPath,
} from "@/lib/brand-media";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  selectMembership,
} from "@/lib/membership-selection";
import { reportServerError } from "@/lib/server-telemetry";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const RequestSchema = z.object({
  item_id: z.uuid(),
  instructions: MenuImageInstructionsSchema.optional().default(""),
  replace_asset_id: z.uuid().nullable().optional(),
  organization_id: z.uuid().optional(),
  menu_id: z.uuid().optional(),
  generation_context: z.enum(["manual", "style_sample", "catalog_regeneration"]).optional().default("manual"),
  batch_id: z.uuid().nullable().optional(),
  quality: MenuImageQualitySchema.optional(),
  use_logo: z.boolean().optional().default(false),
});

const CompletionSchema = z.object({
  asset_id: z.uuid(),
  archived_object_path: z.string().nullable(),
});

function isCrossSite(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return true;
  const origin = request.headers.get("origin");
  return Boolean(origin && origin !== new URL(request.url).origin);
}

function publicGenerationError(error: unknown) {
  if (error instanceof OpenAI.APIError) {
    const code = typeof error.code === "string" ? error.code : null;
    if (code === "moderation_blocked") {
      return {
        code: "moderation_blocked",
        message: "Questa descrizione non ha prodotto un’immagine utilizzabile. Controlla il testo del prodotto e riprova.",
        retryable: false,
      };
    }
    if (error.status === 429) {
      return {
        code: "rate_limited",
        message: "La coda immagini è temporaneamente piena. La bozza attuale è rimasta invariata: riprova tra poco.",
        retryable: true,
      };
    }
    if (error.status && error.status >= 500) {
      return {
        code: "provider_unavailable",
        message: "Il servizio immagini è temporaneamente indisponibile. La bozza attuale è rimasta invariata.",
        retryable: true,
      };
    }
  }
  return {
    code: "generation_failed",
    message: "Non è stato possibile generare questa immagine. La bozza attuale è rimasta invariata.",
    retryable: true,
  };
}

export async function POST(request: Request) {
  if (isCrossSite(request)) {
    return Response.json({ error: "Richiesta cross-site rifiutata." }, { status: 403 });
  }

  let selection: z.infer<typeof RequestSchema>;
  try {
    selection = RequestSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Prodotto o indicazioni non validi." }, { status: 400 });
  }
  if (
    selection.generation_context !== "style_sample"
    && (selection.quality !== undefined || selection.use_logo)
  ) {
    return Response.json({
      error: "Qualità personalizzata e logo sono disponibili soltanto per le quattro prove.",
    }, { status: 400 });
  }

  const userClient = await createClient();
  if (!userClient) {
    return Response.json({ error: "Supabase non configurato." }, { status: 503 });
  }
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return Response.json({ error: "Sessione non valida." }, { status: 401 });
  }

  const [membershipResult, operatorResult] = await Promise.all([
    userClient.from("memberships")
      .select("id,organization_id,user_id,role")
      .eq("user_id", authData.user.id)
      .in("role", ["owner", "editor"])
      .order("created_at"),
    userClient.from("platform_staff")
      .select("user_id")
      .eq("user_id", authData.user.id)
      .eq("active", true)
      .maybeSingle(),
  ]);
  if (membershipResult.error || operatorResult.error) {
    return Response.json({ error: "Autorizzazione non disponibile." }, { status: 500 });
  }

  const cookieStore = await cookies();
  const membership = selectMembership(
    membershipResult.data ?? [],
    cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value,
  );
  const isOperator = Boolean(operatorResult.data);
  const organizationId = isOperator && selection.organization_id
    ? selection.organization_id
    : membership?.organization_id;
  if (
    !organizationId
    || (selection.organization_id && selection.organization_id !== organizationId)
  ) {
    return Response.json({ error: "Organizzazione non modificabile." }, { status: 403 });
  }

  const { data: item, error: itemError } = await userClient
    .from("menu_items")
    .select("id,category_id,name_it,description_it,ingredients_it,vegetarian,vegan,gluten_free,image_url")
    .eq("id", selection.item_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (itemError || !item) {
    return Response.json({ error: "Il prodotto non è più disponibile." }, { status: 404 });
  }
  const { data: category, error: categoryError } = await userClient
    .from("menu_categories")
    .select("id,menu_id,name_it")
    .eq("id", item.category_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (
    categoryError
    || !category
    || (selection.menu_id && selection.menu_id !== category.menu_id)
  ) {
    return Response.json({ error: "La categoria o il menu del prodotto non sono disponibili." }, { status: 409 });
  }

  const admin = createAdminClient();
  const { data: replacement, error: replacementError } = selection.replace_asset_id
    ? await userClient.from("media_assets")
      .select("id,organization_id,menu_id,menu_item_id,ai_job_id,bucket_id,object_path,approval_status,is_public")
      .eq("id", selection.replace_asset_id)
      .eq("organization_id", organizationId)
      .eq("menu_id", category.menu_id)
      .eq("menu_item_id", item.id)
      .eq("media_kind", "menu_item")
      .maybeSingle()
    : { data: null, error: null };
  if (replacementError || (selection.replace_asset_id && !replacement)) {
    return Response.json({ error: "La bozza da rigenerare non appartiene a questo prodotto." }, { status: 409 });
  }
  const { data: pendingAssets, error: pendingError } = await admin
    .from("media_assets")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("menu_id", category.menu_id)
    .eq("menu_item_id", item.id)
    .eq("media_kind", "menu_item")
    .eq("approval_status", "draft")
    .eq("is_public", false)
    .is("superseded_at", null)
    .limit(2);
  if (pendingError) {
    return Response.json({ error: "Impossibile verificare la coda immagini." }, { status: 500 });
  }
  if ((pendingAssets ?? []).some((asset) => asset.id !== replacement?.id)) {
    return Response.json({
      code: "already_in_review",
      error: "Esiste già un’altra immagine in revisione per questo prodotto.",
    }, { status: 409 });
  }
  if (!replacement && pendingAssets?.length) {
    return Response.json({
      code: "already_in_review",
      error: "Un’immagine per questo prodotto è già in revisione.",
    }, { status: 409 });
  }

  const quality = selection.quality ?? MENU_IMAGE_QUALITY;
  let logoAssetId: string | null = null;
  let logoReference: {
    bytes: Buffer;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
  } | undefined;
  if (selection.use_logo) {
    const { data: logoAsset, error: logoAssetError } = await admin
      .from("media_assets")
      .select("id,bucket_id,object_path,mime_type")
      .eq("organization_id", organizationId)
      .eq("media_kind", "logo")
      .eq("bucket_id", "public-media")
      .eq("approval_status", "approved")
      .eq("is_public", true)
      .order("approved_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (logoAssetError) {
      return Response.json({ error: "Impossibile verificare il logo approvato." }, { status: 500 });
    }
    if (!logoAsset) {
      return Response.json({
        code: "approved_logo_required",
        error: "Carica e fai approvare il logo del ristorante prima di usarlo nelle prove.",
      }, { status: 409 });
    }
    const { data: logoBlob, error: logoDownloadError } = await admin.storage
      .from("public-media")
      .download(logoAsset.object_path);
    if (logoDownloadError || !logoBlob) {
      return Response.json({ error: "Il logo approvato non è temporaneamente disponibile." }, { status: 500 });
    }
    const logoBytes = Buffer.from(await logoBlob.arrayBuffer());
    const detectedLogoMime = detectBrandImageMime(logoBytes.subarray(0, 12));
    if (
      !detectedLogoMime
      || detectedLogoMime !== logoAsset.mime_type
      || logoBytes.length === 0
      || logoBytes.length > BRAND_MEDIA_MAX_BYTES
    ) {
      return Response.json({
        code: "invalid_approved_logo",
        error: "Il logo approvato non è un’immagine valida. Caricane una nuova dal pannello Sito.",
      }, { status: 409 });
    }
    logoAssetId = logoAsset.id;
    logoReference = { bytes: logoBytes, mimeType: detectedLogoMime };
  }

  const source = menuImageSourceFromItem(item, category.name_it);
  const sourceDigest = menuImageSourceHash(source);
  const prompt = menuImagePrompt(source, selection.instructions, {
    includeRestaurantLogo: Boolean(logoReference),
  });
  const promptDigest = sourceHash(prompt);
  const requestKey = sourceHash(JSON.stringify({
    organization_id: organizationId,
    menu_id: category.menu_id,
    item_id: item.id,
    source_hash: sourceDigest,
    prompt_hash: promptDigest,
    prompt_version: MENU_IMAGE_PROMPT_VERSION,
    source_asset_id: replacement?.id ?? null,
    quality,
    logo_asset_id: logoAssetId,
    size: MENU_IMAGE_SIZE,
  }));
  const activeSince = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: activeJob, error: activeJobError } = await admin
    .from("ai_jobs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("menu_id", category.menu_id)
    .eq("kind", "image_generation")
    .contains("input", { item_id: item.id, request_key: requestKey })
    .in("status", ["pending", "queued", "running"])
    .gte("created_at", activeSince)
    .limit(1)
    .maybeSingle();
  if (activeJobError) {
    return Response.json({ error: "Impossibile verificare il job immagine." }, { status: 500 });
  }
  if (activeJob) {
    return Response.json({
      code: "already_running",
      error: "La generazione di questo prodotto è già in corso.",
    }, { status: 409 });
  }

  const startedAt = new Date().toISOString();
  const { data: job, error: jobError } = await admin.from("ai_jobs").insert({
    organization_id: organizationId,
    menu_id: category.menu_id,
    kind: "image_generation",
    job_type: "image_generation",
    model: getImageModel(),
    prompt_version: MENU_IMAGE_PROMPT_VERSION,
    status: "running",
    attempts: 1,
    input: {
      item_id: item.id,
      request_key: requestKey,
      source_hash: sourceDigest,
      prompt_hash: promptDigest,
      source,
      prompt,
      visual_instructions: selection.instructions || null,
      generation_context: selection.generation_context,
      batch_id: selection.batch_id ?? null,
      logo_asset_id: logoAssetId,
      provenance: {
        type: replacement
          ? "regeneration"
          : item.image_url
            ? "regeneration_from_current_attachment"
            : "initial_generation",
        source_asset_id: replacement?.id ?? null,
        source_ai_job_id: replacement?.ai_job_id ?? null,
        source_image_present: Boolean(item.image_url),
        workflow: selection.generation_context,
        batch_id: selection.batch_id ?? null,
        brand_reference: logoAssetId ? {
          type: "approved_restaurant_logo",
          asset_id: logoAssetId,
        } : null,
      },
      quality,
      size: MENU_IMAGE_SIZE,
      output_format: MENU_IMAGE_FORMAT,
      output_compression: MENU_IMAGE_COMPRESSION,
    },
    started_at: startedAt,
    created_by: authData.user.id,
  }).select("id").single();
  if (jobError || !job) {
    return Response.json({ error: "Non è stato possibile avviare la generazione." }, { status: 500 });
  }

  let objectPath: string | null = null;
  let completionCommitted = false;
  try {
    const generated = await createMenuImage(source, {
      instructions: selection.instructions,
      quality,
      logoReference,
    });
    const [{ data: currentItem }, { data: currentCategory }] = await Promise.all([
      admin.from("menu_items")
        .select("id,name_it,description_it,ingredients_it,vegetarian,vegan,gluten_free")
        .eq("id", item.id)
        .eq("organization_id", organizationId)
        .maybeSingle(),
      admin.from("menu_categories")
        .select("id,name_it")
        .eq("id", category.id)
        .eq("organization_id", organizationId)
        .maybeSingle(),
    ]);
    if (
      !currentItem
      || !currentCategory
      || menuImageSourceHash(menuImageSourceFromItem(currentItem, currentCategory.name_it)) !== sourceDigest
    ) {
      throw new Error("Il testo del prodotto è cambiato durante la generazione.");
    }

    objectPath = menuItemMediaObjectPath(
      organizationId,
      item.id,
      crypto.randomUUID(),
      "image/webp",
    );
    const { error: uploadError } = await admin.storage.from("intake").upload(
      objectPath,
      generated.bytes,
      { contentType: "image/webp", cacheControl: "3600", upsert: false },
    );
    if (uploadError) throw new Error("Salvataggio privato dell’immagine non riuscito.");

    const { data: completion, error: completionError } = await userClient.rpc(
      "complete_menu_image_generation",
      {
        p_job_id: job.id,
        p_organization_id: organizationId,
        p_menu_id: category.menu_id,
        p_menu_item_id: item.id,
        p_replaces_asset_id: replacement?.id ?? null,
        p_object_path: objectPath,
        p_mime_type: "image/webp",
        p_alt_text: item.name_it,
        p_model: generated.model,
        p_response_id: generated.requestId,
        p_usage: generated.usage ?? null,
      },
    );
    const completed = CompletionSchema.safeParse(completion);
    if (completionError || !completed.success) {
      throw new Error("Completamento atomico della nuova bozza non riuscito.");
    }
    completionCommitted = true;

    if (completed.data.archived_object_path) {
      const { error: archiveCleanupError } = await admin.storage
        .from("intake")
        .remove([completed.data.archived_object_path]);
      if (archiveCleanupError) {
        reportServerError("menu_image_archived_source_cleanup_failed", archiveCleanupError);
      }
    }

    const { data: preview } = await admin.storage.from("intake").createSignedUrl(objectPath, 15 * 60);
    return NextResponse.json({
      item_id: item.id,
      asset_id: completed.data.asset_id,
      replaced_asset_id: replacement?.id ?? null,
      preview_url: preview?.signedUrl ?? null,
      status: "in_review",
      quality,
      logo_used: Boolean(logoAssetId),
    });
  } catch (error) {
    if (objectPath && !completionCommitted) {
      await admin.storage.from("intake").remove([objectPath]);
    }

    const providerError = publicGenerationError(error);
    const reference = reportServerError("menu_image_generation_failed", error);
    const providerStatus = error instanceof OpenAI.APIError ? error.status : null;
    const providerCode = error instanceof OpenAI.APIError && typeof error.code === "string"
      ? error.code
      : null;
    const requestId = error instanceof OpenAI.APIError ? error.requestID : null;
    if (!completionCommitted) {
      await admin.from("ai_jobs").update({
        response_id: requestId,
        status: "failed",
        error: {
          code: providerCode ?? providerError.code,
          provider_status: providerStatus,
          reference,
          retryable: providerError.retryable,
          previous_asset_preserved: Boolean(replacement),
        },
        completed_at: new Date().toISOString(),
      }).eq("id", job.id).eq("organization_id", organizationId).eq("status", "running");
    }

    return Response.json({
      code: providerError.code,
      error: providerError.message,
      retryable: providerError.retryable,
      reference,
    }, { status: providerStatus === 429 ? 429 : 502 });
  }
}
