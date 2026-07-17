import OpenAI from "openai";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createMenuImage,
  MENU_IMAGE_COMPRESSION,
  MENU_IMAGE_FORMAT,
  MENU_IMAGE_PROMPT_VERSION,
  MENU_IMAGE_QUALITY,
  MENU_IMAGE_SIZE,
  menuImageSourceFromItem,
  menuImageSourceHash,
} from "@/lib/ai/menu-image";
import { sourceHash } from "@/lib/ai/source-hash";
import { menuItemMediaObjectPath } from "@/lib/brand-media";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  selectMembership,
} from "@/lib/membership-selection";
import { reportServerError } from "@/lib/server-telemetry";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const RequestSchema = z.object({ item_id: z.uuid() });

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
        message: "Questa descrizione non ha prodotto un’immagine utilizzabile. Controlla il testo del piatto e riprova.",
        retryable: false,
      };
    }
    if (error.status === 429) {
      return {
        code: "rate_limited",
        message: "La coda immagini è temporaneamente piena. Il piatto potrà essere riprovato dal pulsante principale.",
        retryable: true,
      };
    }
    if (error.status && error.status >= 500) {
      return {
        code: "provider_unavailable",
        message: "Il servizio immagini è temporaneamente indisponibile. Riprova tra poco.",
        retryable: true,
      };
    }
  }
  return {
    code: "generation_failed",
    message: "Non è stato possibile generare questa immagine. Potrai riprovarla dal pulsante principale.",
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
    return Response.json({ error: "Piatto non valido." }, { status: 400 });
  }

  const userClient = await createClient();
  if (!userClient) {
    return Response.json({ error: "Supabase non configurato." }, { status: 503 });
  }
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return Response.json({ error: "Sessione non valida." }, { status: 401 });
  }
  const { data: memberships, error: membershipError } = await userClient
    .from("memberships")
    .select("id,organization_id,user_id,role")
    .eq("user_id", authData.user.id)
    .in("role", ["owner", "editor"])
    .order("created_at");
  if (membershipError) {
    return Response.json({ error: "Organizzazione non disponibile." }, { status: 500 });
  }
  const cookieStore = await cookies();
  const membership = selectMembership(
    memberships ?? [],
    cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value,
  );
  if (!membership) {
    return Response.json({ error: "Nessuna organizzazione modificabile." }, { status: 403 });
  }

  const organizationId = membership.organization_id;
  const { data: item, error: itemError } = await userClient
    .from("menu_items")
    .select("id,category_id,name_it,description_it,ingredients_it,vegetarian,vegan,gluten_free,image_url")
    .eq("id", selection.item_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (itemError || !item) {
    return Response.json({ error: "Il piatto non è più disponibile." }, { status: 404 });
  }
  if (item.image_url) {
    return Response.json({
      code: "already_has_image",
      error: "Il piatto ha già un’immagine approvata.",
    }, { status: 409 });
  }
  const { data: category, error: categoryError } = await userClient
    .from("menu_categories")
    .select("id,menu_id,name_it")
    .eq("id", item.category_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (categoryError || !category) {
    return Response.json({ error: "La categoria del piatto non è disponibile." }, { status: 409 });
  }

  const admin = createAdminClient();
  const { data: pendingAsset, error: pendingError } = await admin
    .from("media_assets")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("menu_item_id", item.id)
    .eq("media_kind", "menu_item")
    .eq("approval_status", "draft")
    .eq("is_public", false)
    .limit(1)
    .maybeSingle();
  if (pendingError) {
    return Response.json({ error: "Impossibile verificare la coda immagini." }, { status: 500 });
  }
  if (pendingAsset) {
    return Response.json({
      code: "already_in_review",
      error: "Un’immagine per questo piatto è già in revisione.",
    }, { status: 409 });
  }

  const source = menuImageSourceFromItem(item, category.name_it);
  const sourceDigest = menuImageSourceHash(source);
  const requestKey = sourceHash(JSON.stringify({
    organization_id: organizationId,
    source_hash: sourceDigest,
    prompt_version: MENU_IMAGE_PROMPT_VERSION,
    quality: MENU_IMAGE_QUALITY,
    size: MENU_IMAGE_SIZE,
  }));
  const activeSince = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: activeJob, error: activeJobError } = await admin
    .from("ai_jobs")
    .select("id")
    .eq("organization_id", organizationId)
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
      error: "La generazione di questo piatto è già in corso.",
    }, { status: 409 });
  }

  const startedAt = new Date().toISOString();
  const { data: job, error: jobError } = await admin.from("ai_jobs").insert({
    organization_id: organizationId,
    menu_id: category.menu_id,
    kind: "image_generation",
    job_type: "image_generation",
    model: process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2",
    prompt_version: MENU_IMAGE_PROMPT_VERSION,
    status: "running",
    attempts: 1,
    input: {
      item_id: item.id,
      request_key: requestKey,
      source_hash: sourceDigest,
      source,
      quality: MENU_IMAGE_QUALITY,
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
  let assetId: string | null = null;
  try {
    const generated = await createMenuImage(source);
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
      throw new Error("Il testo del piatto è cambiato durante la generazione.");
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

    const { data: asset, error: assetError } = await admin.from("media_assets").insert({
      organization_id: organizationId,
      menu_id: category.menu_id,
      menu_item_id: item.id,
      ai_job_id: job.id,
      bucket_id: "intake",
      object_path: objectPath,
      media_kind: "menu_item",
      mime_type: "image/webp",
      alt_text: item.name_it,
      approval_status: "draft",
      is_public: false,
      created_by: authData.user.id,
    }).select("id").single();
    if (assetError || !asset) throw new Error("Registrazione della bozza immagine non riuscita.");
    assetId = asset.id;

    const { data: completedJob, error: completionError } = await admin.from("ai_jobs").update({
      model: generated.model,
      response_id: generated.requestId,
      status: "completed",
      output: {
        asset_id: asset.id,
        storage_bucket: "intake",
        storage_path: objectPath,
        mime_type: "image/webp",
      },
      usage: generated.usage,
      completed_at: new Date().toISOString(),
    }).eq("id", job.id).eq("organization_id", organizationId).eq("status", "running")
      .select("id")
      .maybeSingle();
    if (completionError || !completedJob) {
      throw new Error("Completamento del job immagine non riuscito.");
    }

    const { data: preview } = await admin.storage.from("intake").createSignedUrl(objectPath, 15 * 60);
    return NextResponse.json({
      item_id: item.id,
      asset_id: asset.id,
      preview_url: preview?.signedUrl ?? null,
      status: "in_review",
    });
  } catch (error) {
    if (assetId) {
      await admin.from("media_assets")
        .delete()
        .eq("id", assetId)
        .eq("organization_id", organizationId);
    }
    if (objectPath) await admin.storage.from("intake").remove([objectPath]);

    const providerError = publicGenerationError(error);
    const reference = reportServerError("menu_image_generation_failed", error);
    const providerStatus = error instanceof OpenAI.APIError ? error.status : null;
    const providerCode = error instanceof OpenAI.APIError && typeof error.code === "string"
      ? error.code
      : null;
    const requestId = error instanceof OpenAI.APIError ? error.requestID : null;
    await admin.from("ai_jobs").update({
      response_id: requestId,
      status: "failed",
      error: {
        code: providerCode ?? providerError.code,
        provider_status: providerStatus,
        reference,
        retryable: providerError.retryable,
      },
      completed_at: new Date().toISOString(),
    }).eq("id", job.id).eq("organization_id", organizationId);

    return Response.json({
      code: providerError.code,
      error: providerError.message,
      retryable: providerError.retryable,
      reference,
    }, { status: providerStatus === 429 ? 429 : 502 });
  }
}
