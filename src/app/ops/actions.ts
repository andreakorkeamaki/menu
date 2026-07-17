"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOperator } from "@/lib/auth";
import { resolveOwnerAuthUser } from "@/lib/auth-admin";
import { getAiModelSettings } from "@/lib/ai/config";
import { MENU_IMPORT_PROMPT_VERSION } from "@/lib/ai/menu-import";
import { menuImageSourceFromItem, menuImageSourceHash } from "@/lib/ai/menu-image";
import { MenuImportStagingSchema } from "@/lib/ai/schemas";
import { classifyMenuImportSource } from "@/lib/import/source";
import { ImportRetryClaimSchema, validatedRetrySource } from "@/lib/import/recovery";
import { runMenuImport } from "@/lib/import/run-menu-import";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeSlug } from "@/lib/slug";
import { DEMO_REQUEST_STATUSES } from "@/lib/demo-request";
import { brandMediaObjectPath, detectBrandImageMime, menuItemMediaObjectPath } from "@/lib/brand-media";
import { MediaProcessingError, preparePublicMedia } from "@/lib/media-processing";
import { mediaReviewHref, parseMediaReviewPage } from "@/lib/media-review-pagination";
import { leadListHref, parseLeadPage } from "@/lib/lead-list";
import { reportServerError } from "@/lib/server-telemetry";

export async function updateDemoRequestStatus(formData: FormData) {
  await requireOperator();
  const returnStatusValue = formData.get("return_status")?.toString();
  const returnStatus = DEMO_REQUEST_STATUSES.find((status) => status === returnStatusValue);
  const returnPage = parseLeadPage(formData.get("return_page")?.toString());
  const leadRedirect = (result: { updated?: boolean; error?: string }) => leadListHref({
    status: returnStatus,
    page: returnPage,
    ...result,
  });
  const parsed = z.object({
    request_id: z.uuid(),
    status: z.enum(DEMO_REQUEST_STATUSES),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(leadRedirect({ error: "invalid" }));
  if (parsed.data.status === "converted") redirect(leadRedirect({ error: "use-conversion" }));

  const supabase = await createClient();
  const { data, error } = await supabase!.from("demo_requests")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.request_id)
    .select("id")
    .maybeSingle();
  if (error || !data) redirect(leadRedirect({ error: "update" }));

  revalidatePath("/ops/leads");
  redirect(leadRedirect({ updated: true }));
}

export async function reviewBrandMedia(formData: FormData) {
  await requireOperator();
  const returnPage = parseMediaReviewPage(formData.get("return_page")?.toString());
  const mediaRedirect = (result: { reviewed?: "approved" | "rejected"; error?: string }) => mediaReviewHref(returnPage, result);
  const parsed = z.object({
    asset_id: z.uuid(),
    organization_id: z.uuid(),
    action: z.enum(["approve", "reject"]),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(mediaRedirect({ error: "invalid" }));

  const supabase = await createClient();
  const { data: asset, error: assetError } = await supabase!.from("media_assets")
    .select("id,organization_id,location_id,menu_id,menu_item_id,ai_job_id,bucket_id,object_path,media_kind,mime_type,approval_status,is_public")
    .eq("id", parsed.data.asset_id)
    .eq("organization_id", parsed.data.organization_id)
    .maybeSingle();
  if (
    assetError
    || !asset
    || asset.bucket_id !== "intake"
    || asset.approval_status !== "draft"
    || asset.is_public
    || !["logo", "cover", "menu_item"].includes(asset.media_kind)
    || (asset.media_kind === "menu_item" && (!asset.menu_id || !asset.menu_item_id))
  ) redirect(mediaRedirect({ error: "not-reviewable" }));

  const admin = createAdminClient();
  if (asset.ai_job_id && parsed.data.action === "approve") {
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
    ) redirect(mediaRedirect({ error: "generated-source" }));

    const { data: currentCategory, error: generatedCategoryError } = await admin.from("menu_categories")
      .select("id,name_it")
      .eq("id", currentItem.category_id)
      .eq("organization_id", asset.organization_id)
      .maybeSingle();
    if (generatedCategoryError || !currentCategory) {
      redirect(mediaRedirect({ error: "generated-source" }));
    }
    const currentSourceHash = menuImageSourceHash(
      menuImageSourceFromItem(currentItem, currentCategory.name_it),
    );
    if (currentSourceHash !== (job.input as Record<string, unknown>).source_hash) {
      redirect(mediaRedirect({ error: "generated-stale" }));
    }
  }

  if (parsed.data.action === "reject") {
    const { error } = await supabase!.rpc("review_brand_media", {
      p_asset_id: asset.id,
      p_organization_id: asset.organization_id,
      p_action: "reject",
      p_public_path: null,
      p_public_url: null,
    });
    if (error) redirect(mediaRedirect({ error: "review" }));
    await admin.storage.from("intake").remove([asset.object_path]);
    revalidatePath("/ops/media");
    revalidatePath("/dashboard/site");
    revalidatePath("/dashboard/menu");
    redirect(mediaRedirect({ reviewed: "rejected" }));
  }

  const { data: source, error: downloadError } = await admin.storage.from("intake").download(asset.object_path);
  if (downloadError || !source) redirect(mediaRedirect({ error: "source" }));
  const detectedMime = detectBrandImageMime(new Uint8Array(await source.slice(0, 12).arrayBuffer()));
  if (!detectedMime || asset.mime_type !== detectedMime) redirect(mediaRedirect({ error: "unsafe-source" }));

  let prepared: Awaited<ReturnType<typeof preparePublicMedia>>;
  try {
    prepared = await preparePublicMedia(
      Buffer.from(await source.arrayBuffer()),
      asset.media_kind as "logo" | "cover" | "menu_item",
    );
  } catch (error) {
    if (error instanceof MediaProcessingError && error.reason === "dimensions") {
      redirect(mediaRedirect({ error: "dimensions" }));
    }
    redirect(mediaRedirect({ error: "unsafe-source" }));
  }

  const publicPath = asset.media_kind === "menu_item"
    ? menuItemMediaObjectPath(asset.organization_id, asset.menu_item_id!, crypto.randomUUID(), prepared.mime)
    : brandMediaObjectPath(asset.organization_id, asset.media_kind, crypto.randomUUID(), prepared.mime);
  const { error: uploadError } = await admin.storage.from("public-media").upload(publicPath, prepared.data, {
    contentType: prepared.mime,
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) redirect(mediaRedirect({ error: "promote" }));
  const { data: publicData } = admin.storage.from("public-media").getPublicUrl(publicPath);

  const { error: reviewError } = await supabase!.rpc("review_brand_media", {
    p_asset_id: asset.id,
    p_organization_id: asset.organization_id,
    p_action: "approve",
    p_public_path: publicPath,
    p_public_url: publicData.publicUrl,
  });
  if (reviewError) {
    await admin.storage.from("public-media").remove([publicPath]);
    redirect(mediaRedirect({ error: "review" }));
  }
  await admin.storage.from("intake").remove([asset.object_path]);

  revalidatePath("/ops/media");
  revalidatePath("/dashboard/site");
  revalidatePath("/dashboard/menu");
  revalidatePath("/dashboard/menu/preview");
  revalidatePath("/dashboard/menu/review");
  redirect(mediaRedirect({ reviewed: "approved" }));
}

export async function provisionOrganization(formData: FormData) {
  await requireOperator();
  const demoRequestId = z.uuid().safeParse(formData.get("demo_request_id"));
  const leadSuffix = demoRequestId.success ? `&lead=${demoRequestId.data}` : "";
  const parsed = z.object({
    organization_name: z.string().trim().min(2).max(160),
    location_name: z.string().trim().min(2).max(160),
    city: z.string().trim().min(2).max(120),
    slug: z.string().trim().min(2).max(80),
    owner_email: z.email(),
    contact_name: z.string().trim().max(160).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/ops/new?error=invalid${leadSuffix}`);
  const admin = createAdminClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  let owner: Awaited<ReturnType<typeof resolveOwnerAuthUser>>;
  try {
    const callback = new URL("/auth/callback", origin);
    callback.searchParams.set("next", "/login/reset-password?mode=invite");
    owner = await resolveOwnerAuthUser({
      admin,
      email: parsed.data.owner_email,
      fullName: parsed.data.contact_name || parsed.data.location_name,
      redirectTo: callback.toString(),
    });
  } catch {
    redirect(`/ops/new?error=invite${leadSuffix}`);
  }
  const supabase = await createClient();
  const { data, error } = await supabase!.rpc("provision_restaurant", {
    p_name: parsed.data.organization_name,
    p_slug: normalizeSlug(parsed.data.slug),
    p_location_name: parsed.data.location_name,
    p_location_slug: normalizeSlug(parsed.data.slug),
    p_owner_user_id: owner.user.id,
    p_contact_name: parsed.data.contact_name || parsed.data.location_name,
    p_contact_email: parsed.data.owner_email.toLocaleLowerCase("en-US"),
    p_city: parsed.data.city,
    p_demo_request_id: demoRequestId.success ? demoRequestId.data : null,
  });
  if (error) {
    if (owner.invitation === "sent") {
      await admin.auth.admin.deleteUser(owner.user.id);
    }
    redirect(`/ops/new?error=${encodeURIComponent(error.code ?? "provision")}${leadSuffix}`);
  }
  const result = z.object({
    organization_id: z.uuid(),
    location_id: z.uuid(),
    menu_id: z.uuid(),
    onboarding_case_id: z.uuid(),
    qr_code: z.string().min(6),
    created: z.boolean(),
  }).safeParse(data);
  if (!result.success) redirect(`/ops/new?error=provision-result${leadSuffix}`);
  revalidatePath("/ops");
  revalidatePath("/ops/leads");
  redirect(`/ops/import?case=${result.data.onboarding_case_id}&provisioned=${result.data.created ? "1" : "existing"}&invitation=${owner.invitation}&qr=${encodeURIComponent(result.data.qr_code)}${demoRequestId.success ? "&lead_converted=1" : ""}`);
}

async function markMenuImportFailed(input: {
  admin: ReturnType<typeof createAdminClient>;
  jobId: string;
  organizationId: string;
  onboardingCaseId: string;
  sourcePath: string;
  event: string;
  error: unknown;
}) {
  const reference = reportServerError(input.event, input.error);
  const completedAt = new Date().toISOString();
  const [jobResult, onboardingResult] = await Promise.all([
    input.admin.from("ai_jobs").update({
      status: "failed",
      error: { message: "Elaborazione non riuscita. Il file privato è disponibile per un nuovo tentativo.", reference },
      completed_at: completedAt,
    }).eq("id", input.jobId).eq("organization_id", input.organizationId),
    input.admin.from("onboarding_cases").update({
      status: "ready",
      source_file_path: input.sourcePath,
    }).eq("id", input.onboardingCaseId).eq("organization_id", input.organizationId),
  ]);
  if (jobResult.error || onboardingResult.error) {
    reportServerError("menu_import_failure_persistence_failed", jobResult.error ?? onboardingResult.error);
  }
  return reference;
}

export async function uploadIntakeMaterial(formData: FormData) {
  const context = await requireOperator();
  const caseId = z.uuid().safeParse(formData.get("case_id"));
  const file = formData.get("file");
  if (!caseId.success || !(file instanceof File) || !file.size) redirect("/ops/import?error=invalid-file");
  if (file.size > 20 * 1024 * 1024) redirect(`/ops/import?case=${caseId.data}&error=file-too-large`);
  const sourceType = classifyMenuImportSource(file.name);
  if (!sourceType) redirect(`/ops/import?case=${caseId.data}&error=file-type`);
  const admin = createAdminClient();
  const { data: onboarding, error: onboardingError } = await admin
    .from("onboarding_cases")
    .select("organization_id,location_id")
    .eq("id", caseId.data)
    .maybeSingle();
  if (onboardingError || !onboarding?.location_id) redirect("/ops/import?error=case-not-found");
  const { data: menu, error: menuError } = await admin
    .from("menus")
    .select("id,name")
    .eq("organization_id", onboarding.organization_id)
    .eq("location_id", onboarding.location_id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (menuError || !menu) redirect(`/ops/import?case=${caseId.data}&error=menu-not-found`);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
  const path = `${onboarding.organization_id}/${caseId.data}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await admin.storage.from("intake").upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) redirect(`/ops/import?case=${caseId.data}&error=upload`);

  const modelSettings = sourceType.parser === "openai"
    ? getAiModelSettings("import")
    : { model: `deterministic-${sourceType.parser}`, reasoningEffort: "high" as const };
  const jobInput = {
    storage_bucket: "intake" as const,
    storage_path: path,
    filename: file.name,
    mime_type: sourceType.mimeType,
    size_bytes: file.size,
    parser: sourceType.parser,
    reasoning_effort: sourceType.parser === "openai" ? modelSettings.reasoningEffort : null,
  };
  const { data: job, error: jobError } = await admin.from("ai_jobs").insert({
    organization_id: onboarding.organization_id,
    onboarding_case_id: caseId.data,
    menu_id: menu.id,
    kind: "menu_import",
    model: modelSettings.model,
    prompt_version: sourceType.parser === "openai" ? MENU_IMPORT_PROMPT_VERSION : "tabular-import-v1",
    status: "queued",
    attempts: 1,
    input: jobInput,
    input_file_path: path,
    created_by: context.profile.id,
  }).select("id").single();
  if (jobError || !job) {
    await admin.storage.from("intake").remove([path]);
    redirect(`/ops/import?case=${caseId.data}&error=queue`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    await runMenuImport({
      organizationId: onboarding.organization_id,
      onboardingCaseId: caseId.data,
      menuId: menu.id,
      menuName: menu.name,
      jobId: job.id,
      attempt: 1,
      bytes,
      source: sourceType,
      jobInput,
      admin,
    });
  } catch (error) {
    const reference = await markMenuImportFailed({
      admin,
      jobId: job.id,
      organizationId: onboarding.organization_id,
      onboardingCaseId: caseId.data,
      sourcePath: path,
      event: "menu_import_initial_processing_failed",
      error,
    });
    redirect(`/ops/import?case=${caseId.data}&error=processing&job=${job.id}&reference=${reference}`);
  }
  revalidatePath("/ops");
  redirect(`/ops/import?case=${caseId.data}&uploaded=1&job=${job.id}`);
}

export async function retryMenuImport(formData: FormData) {
  await requireOperator();
  const parsed = z.object({ job_id: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/ops/import?error=retry-invalid");

  const supabase = await createClient();
  const { data, error: claimError } = await supabase!.rpc("claim_menu_import_retry", {
    p_job_id: parsed.data.job_id,
  });
  if (claimError) {
    const reason = claimError.code === "P0001" ? "retry-unavailable" : claimError.code === "P0002" ? "retry-missing" : "retry-claim";
    redirect(`/ops/import?error=${reason}`);
  }

  const claimResult = ImportRetryClaimSchema.safeParse(data);
  const admin = createAdminClient();
  if (!claimResult.success) {
    const reference = reportServerError("menu_import_retry_claim_invalid", claimResult.error);
    await admin.from("ai_jobs").update({
      status: "failed",
      error: { message: "Il file conservato non può essere riutilizzato in sicurezza.", reference },
      completed_at: new Date().toISOString(),
    }).eq("id", parsed.data.job_id);
    redirect(`/ops/import?error=retry-source&reference=${reference}`);
  }

  const claim = claimResult.data;
  try {
    const source = validatedRetrySource(claim);
    const [{ data: menu, error: menuError }, { data: file, error: downloadError }] = await Promise.all([
      admin.from("menus").select("id,name")
        .eq("id", claim.menu_id)
        .eq("organization_id", claim.organization_id)
        .maybeSingle(),
      admin.storage.from("intake").download(claim.source_path),
    ]);
    if (menuError || !menu) throw new Error(menuError?.message ?? "Menu del job non trovato.");
    if (downloadError || !file) throw new Error(downloadError?.message ?? "Fonte privata non trovata.");
    if (file.size !== claim.source.size_bytes) throw new Error("La dimensione della fonte privata non corrisponde al job.");

    await runMenuImport({
      organizationId: claim.organization_id,
      onboardingCaseId: claim.onboarding_case_id,
      menuId: claim.menu_id,
      menuName: menu.name,
      jobId: claim.job_id,
      attempt: claim.attempt,
      bytes: new Uint8Array(await file.arrayBuffer()),
      source,
      jobInput: { ...claim.source, storage_path: claim.source_path },
      admin,
    });
  } catch (error) {
    const reference = await markMenuImportFailed({
      admin,
      jobId: claim.job_id,
      organizationId: claim.organization_id,
      onboardingCaseId: claim.onboarding_case_id,
      sourcePath: claim.source_path,
      event: "menu_import_retry_processing_failed",
      error,
    });
    redirect(`/ops/import?case=${claim.onboarding_case_id}&error=retry-processing&job=${claim.job_id}&reference=${reference}`);
  }

  revalidatePath("/ops");
  revalidatePath("/ops/import");
  redirect(`/ops/import?case=${claim.onboarding_case_id}&retried=1&job=${claim.job_id}`);
}

export async function saveMenuImportStaging(formData: FormData) {
  await requireOperator();
  const parsed = z.object({
    staging_id: z.uuid(),
    organization_id: z.uuid(),
    case_id: z.uuid(),
    payload: z.string().min(2).max(2_000_000),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/ops/import?error=invalid-staging");
  let payload: unknown;
  try {
    payload = JSON.parse(parsed.data.payload);
  } catch {
    redirect(`/ops/import?case=${parsed.data.case_id}&stage=${parsed.data.staging_id}&error=invalid-json`);
  }
  const staging = MenuImportStagingSchema.safeParse(payload);
  if (!staging.success) {
    redirect(`/ops/import?case=${parsed.data.case_id}&stage=${parsed.data.staging_id}&error=invalid-staging-schema`);
  }
  const supabase = await createClient();
  const { data, error } = await supabase!.from("menu_import_staging")
    .update({ payload: staging.data })
    .eq("id", parsed.data.staging_id)
    .eq("organization_id", parsed.data.organization_id)
    .eq("status", "review")
    .select("id")
    .maybeSingle();
  if (error || !data) redirect(`/ops/import?case=${parsed.data.case_id}&stage=${parsed.data.staging_id}&error=save-staging`);
  revalidatePath("/ops/import");
  redirect(`/ops/import?case=${parsed.data.case_id}&stage=${parsed.data.staging_id}&saved=1`);
}

export async function approveMenuImport(formData: FormData) {
  await requireOperator();
  const parsed = z.object({
    staging_id: z.uuid(),
    organization_id: z.uuid(),
    case_id: z.uuid(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/ops/import?error=invalid-approval");
  const supabase = await createClient();
  const { error } = await supabase!.rpc("approve_menu_import", {
    p_staging_id: parsed.data.staging_id,
    p_organization_id: parsed.data.organization_id,
  });
  if (error) {
    const reason = error.code === "P0001" ? "review-required" : "approval";
    redirect(`/ops/import?case=${parsed.data.case_id}&stage=${parsed.data.staging_id}&error=${reason}`);
  }
  revalidatePath("/ops");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/menu");
  revalidatePath("/dashboard/translations");
  redirect(`/ops/import?case=${parsed.data.case_id}&stage=${parsed.data.staging_id}&approved=1`);
}
