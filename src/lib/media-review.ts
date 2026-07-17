import type { SupabaseClient } from "@supabase/supabase-js";
import { menuImageSourceFromItem, menuImageSourceHash } from "@/lib/ai/menu-image";
import { brandMediaObjectPath, detectBrandImageMime, menuItemMediaObjectPath } from "@/lib/brand-media";
import { MediaProcessingError, preparePublicMedia } from "@/lib/media-processing";
import { createAdminClient } from "@/lib/supabase/admin";

export type MediaReviewErrorCode =
  | "not-reviewable"
  | "source"
  | "unsafe-source"
  | "dimensions"
  | "promote"
  | "review"
  | "generated-source"
  | "generated-stale";

export class MediaReviewError extends Error {
  constructor(public readonly code: MediaReviewErrorCode) {
    super(code);
  }
}

function fail(code: MediaReviewErrorCode): never {
  throw new MediaReviewError(code);
}

export async function reviewMediaAsset(input: {
  assetId: string;
  organizationId: string;
  action: "approve" | "reject";
  expectedMenuId?: string;
  operatorClient: SupabaseClient;
  admin?: SupabaseClient;
}) {
  let assetQuery = input.operatorClient.from("media_assets")
    .select("id,organization_id,location_id,menu_id,menu_item_id,ai_job_id,bucket_id,object_path,media_kind,mime_type,approval_status,is_public")
    .eq("id", input.assetId)
    .eq("organization_id", input.organizationId);
  if (input.expectedMenuId) assetQuery = assetQuery.eq("menu_id", input.expectedMenuId);
  const { data: asset, error: assetError } = await assetQuery.maybeSingle();
  if (
    assetError
    || !asset
    || asset.bucket_id !== "intake"
    || asset.approval_status !== "draft"
    || asset.is_public
    || !["logo", "cover", "menu_item"].includes(asset.media_kind)
    || (asset.media_kind === "menu_item" && (!asset.menu_id || !asset.menu_item_id))
  ) fail("not-reviewable");

  const admin = input.admin ?? createAdminClient();
  if (asset.ai_job_id && input.action === "approve") {
    const [{ data: job, error: generatedJobError }, { data: currentItem, error: generatedItemError }] = await Promise.all([
      admin.from("ai_jobs")
        .select("id,kind,status,input")
        .eq("id", asset.ai_job_id)
        .eq("organization_id", asset.organization_id)
        .maybeSingle(),
      admin.from("menu_items")
        .select("id,category_id,name_it,description_it,ingredients_it,vegetarian,vegan,gluten_free")
        .eq("id", asset.menu_item_id!)
        .eq("organization_id", asset.organization_id)
        .maybeSingle(),
    ]);
    if (
      generatedJobError
      || generatedItemError
      || !job
      || !currentItem
      || job.kind !== "image_generation"
      || job.status !== "completed"
      || typeof job.input !== "object"
      || job.input === null
      || (job.input as Record<string, unknown>).item_id !== asset.menu_item_id
      || typeof (job.input as Record<string, unknown>).source_hash !== "string"
      || typeof (job.input as Record<string, unknown>).prompt_hash !== "string"
    ) fail("generated-source");

    const { data: currentCategory, error: generatedCategoryError } = await admin.from("menu_categories")
      .select("id,name_it")
      .eq("id", currentItem.category_id)
      .eq("organization_id", asset.organization_id)
      .maybeSingle();
    if (generatedCategoryError || !currentCategory) fail("generated-source");
    const currentSourceHash = menuImageSourceHash(
      menuImageSourceFromItem(currentItem, currentCategory.name_it),
    );
    if (currentSourceHash !== (job.input as Record<string, unknown>).source_hash) {
      fail("generated-stale");
    }
  }

  if (input.action === "reject") {
    const { error } = await input.operatorClient.rpc("review_brand_media", {
      p_asset_id: asset.id,
      p_organization_id: asset.organization_id,
      p_action: "reject",
      p_public_path: null,
      p_public_url: null,
    });
    if (error) fail("review");
    await admin.storage.from("intake").remove([asset.object_path]);
    return { assetId: asset.id, status: "rejected" as const };
  }

  const { data: source, error: downloadError } = await admin.storage.from("intake").download(asset.object_path);
  if (downloadError || !source) fail("source");
  const detectedMime = detectBrandImageMime(new Uint8Array(await source.slice(0, 12).arrayBuffer()));
  if (!detectedMime || asset.mime_type !== detectedMime) fail("unsafe-source");

  let prepared: Awaited<ReturnType<typeof preparePublicMedia>>;
  try {
    prepared = await preparePublicMedia(
      Buffer.from(await source.arrayBuffer()),
      asset.media_kind as "logo" | "cover" | "menu_item",
    );
  } catch (error) {
    if (error instanceof MediaProcessingError && error.reason === "dimensions") fail("dimensions");
    fail("unsafe-source");
  }

  const publicPath = asset.media_kind === "menu_item"
    ? menuItemMediaObjectPath(asset.organization_id, asset.menu_item_id!, crypto.randomUUID(), prepared.mime)
    : brandMediaObjectPath(asset.organization_id, asset.media_kind, crypto.randomUUID(), prepared.mime);
  const { error: uploadError } = await admin.storage.from("public-media").upload(publicPath, prepared.data, {
    contentType: prepared.mime,
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) fail("promote");
  const { data: publicData } = admin.storage.from("public-media").getPublicUrl(publicPath);

  const { error: reviewError } = await input.operatorClient.rpc("review_brand_media", {
    p_asset_id: asset.id,
    p_organization_id: asset.organization_id,
    p_action: "approve",
    p_public_path: publicPath,
    p_public_url: publicData.publicUrl,
  });
  if (reviewError) {
    await admin.storage.from("public-media").remove([publicPath]);
    fail("review");
  }
  await admin.storage.from("intake").remove([asset.object_path]);
  return { assetId: asset.id, status: "approved" as const, publicPath };
}
