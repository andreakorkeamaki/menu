"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOperator } from "@/lib/auth";
import { resolveOwnerAuthUser } from "@/lib/auth-admin";
import { getAiModelSettings } from "@/lib/ai/config";
import { createOpenAIClient } from "@/lib/ai/client";
import {
  createMenuImportBackgroundJob,
  MENU_IMPORT_PROMPT_VERSION,
  uploadMenuSource,
} from "@/lib/ai/menu-import";
import { MenuImportStagingSchema } from "@/lib/ai/schemas";
import { parseTabularMenu } from "@/lib/import";
import { classifyMenuImportSource } from "@/lib/import/source";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeSlug } from "@/lib/slug";

export async function provisionOrganization(formData: FormData) {
  await requireOperator();
  const parsed = z.object({ organization_name: z.string().trim().min(2).max(160), location_name: z.string().trim().min(2).max(160), slug: z.string().trim().min(2).max(80), owner_email: z.email(), contact_name: z.string().trim().max(160).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/ops/new?error=invalid");
  const admin = createAdminClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  let owner: Awaited<ReturnType<typeof resolveOwnerAuthUser>>;
  try {
    owner = await resolveOwnerAuthUser({
      admin,
      email: parsed.data.owner_email,
      fullName: parsed.data.contact_name || parsed.data.location_name,
      redirectTo: `${origin}/auth/callback?next=/login/reset-password`,
    });
  } catch {
    redirect("/ops/new?error=invite");
  }
  const supabase = await createClient();
  const { data, error } = await supabase!.rpc("provision_organization", {
    p_name: parsed.data.organization_name,
    p_slug: normalizeSlug(parsed.data.slug),
    p_location_name: parsed.data.location_name,
    p_location_slug: normalizeSlug(parsed.data.slug),
    p_owner_user_id: owner.user.id,
    p_contact_name: parsed.data.contact_name || parsed.data.location_name,
    p_contact_email: parsed.data.owner_email.toLocaleLowerCase("en-US"),
  });
  if (error) {
    if (owner.invitation === "sent") {
      await admin.auth.admin.deleteUser(owner.user.id);
    }
    redirect(`/ops/new?error=${encodeURIComponent(error.code ?? "provision")}`);
  }
  const result = z.object({
    organization_id: z.uuid(),
    location_id: z.uuid(),
    menu_id: z.uuid(),
    onboarding_case_id: z.uuid(),
    qr_code: z.string().min(6),
    created: z.boolean(),
  }).safeParse(data);
  if (!result.success) redirect("/ops/new?error=provision-result");
  revalidatePath("/ops");
  redirect(`/ops/import?case=${result.data.onboarding_case_id}&provisioned=${result.data.created ? "1" : "existing"}&invitation=${owner.invitation}&qr=${encodeURIComponent(result.data.qr_code)}`);
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
    storage_bucket: "intake",
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
    attempts: 0,
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
    if (sourceType.parser === "csv" || sourceType.parser === "xlsx") {
      const staged = await parseTabularMenu({
        filename: file.name,
        data: bytes,
        menuName: menu.name,
      });
      const validated = MenuImportStagingSchema.parse(staged);
      const { error } = await admin.rpc("record_menu_import_staging", {
        p_job_id: job.id,
        p_payload: validated,
        p_parser: sourceType.parser,
        p_usage: null,
      });
      if (error) throw new Error(error.message);
    } else {
      const openai = createOpenAIClient();
      const uploaded = await uploadMenuSource({
        data: bytes,
        filename: file.name,
        mimeType: sourceType.mimeType,
        sourceKind: sourceType.openaiKind ?? "document",
        openai,
      });
      const { error: inputUpdateError } = await admin.from("ai_jobs").update({
        input: { ...jobInput, openai_file_id: uploaded.id },
      }).eq("id", job.id).eq("organization_id", onboarding.organization_id);
      if (inputUpdateError) {
        await openai.files.delete(uploaded.id);
        throw new Error(inputUpdateError.message);
      }
      try {
        await createMenuImportBackgroundJob({
          organizationId: onboarding.organization_id,
          onboardingCaseId: caseId.data,
          jobId: job.id,
          fileId: uploaded.id,
          filename: file.name,
          sourceKind: sourceType.openaiKind ?? "document",
          openai,
          admin,
        });
      } catch (error) {
        await openai.files.delete(uploaded.id);
        throw error;
      }
      await admin.from("onboarding_cases").update({
        status: "importing",
        source_file_path: path,
      }).eq("id", caseId.data).eq("organization_id", onboarding.organization_id);
    }
  } catch (error) {
    await admin.from("ai_jobs").update({
      status: "failed",
      error: { message: error instanceof Error ? error.message : "Elaborazione import non riuscita." },
      completed_at: new Date().toISOString(),
    }).eq("id", job.id).eq("organization_id", onboarding.organization_id);
    redirect(`/ops/import?case=${caseId.data}&error=processing&job=${job.id}`);
  }
  revalidatePath("/ops");
  redirect(`/ops/import?case=${caseId.data}&uploaded=1&job=${job.id}`);
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
