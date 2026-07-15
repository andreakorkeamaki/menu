"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOperator } from "@/lib/auth";
import { getAiModelSettings } from "@/lib/ai/config";
import { MENU_IMPORT_PROMPT_VERSION } from "@/lib/ai/menu-import";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeSlug } from "@/lib/slug";

export async function provisionOrganization(formData: FormData) {
  await requireOperator();
  const parsed = z.object({ organization_name: z.string().trim().min(2).max(160), location_name: z.string().trim().min(2).max(160), slug: z.string().trim().min(2).max(80), owner_email: z.email(), contact_name: z.string().trim().max(160).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/ops/new?error=invalid");
  const admin = createAdminClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(parsed.data.owner_email, { data: { full_name: parsed.data.contact_name || parsed.data.location_name }, redirectTo: `${origin}/auth/callback?next=/login/reset-password` });
  if (inviteError || !invite.user) redirect("/ops/new?error=invite");
  const supabase = await createClient();
  const { data, error } = await supabase!.rpc("provision_organization", {
    p_name: parsed.data.organization_name,
    p_slug: normalizeSlug(parsed.data.slug),
    p_location_name: parsed.data.location_name,
    p_location_slug: normalizeSlug(parsed.data.slug),
    p_owner_user_id: invite.user.id,
  });
  if (error) redirect(`/ops/new?error=${encodeURIComponent(error.code ?? "provision")}`);
  const result = z.object({
    organization_id: z.uuid(),
    location_id: z.uuid(),
    onboarding_case_id: z.uuid(),
  }).safeParse(data);
  if (!result.success) redirect("/ops/new?error=provision-result");

  const { data: onboarding, error: onboardingError } = await admin.from("onboarding_cases").update({
    contact_name: parsed.data.contact_name || parsed.data.location_name,
    contact_email: parsed.data.owner_email,
  })
    .eq("id", result.data.onboarding_case_id)
    .eq("organization_id", result.data.organization_id)
    .select("id")
    .maybeSingle();
  revalidatePath("/ops");
  const metadataWarning = onboardingError || !onboarding ? "&warning=onboarding-metadata" : "";
  redirect(`/ops/import?case=${result.data.onboarding_case_id}${metadataWarning}`);
}

export async function uploadIntakeMaterial(formData: FormData) {
  const context = await requireOperator();
  const caseId = z.uuid().safeParse(formData.get("case_id"));
  const file = formData.get("file");
  if (!caseId.success || !(file instanceof File) || !file.size) redirect("/ops/import?error=invalid-file");
  if (file.size > 20 * 1024 * 1024) redirect(`/ops/import?case=${caseId.data}&error=file-too-large`);
  const allowed = new Set(["application/pdf", "text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(file.type)) redirect(`/ops/import?case=${caseId.data}&error=file-type`);
  const admin = createAdminClient();
  const { data: onboarding, error: onboardingError } = await admin
    .from("onboarding_cases")
    .select("organization_id")
    .eq("id", caseId.data)
    .maybeSingle();
  if (onboardingError || !onboarding) redirect("/ops/import?error=case-not-found");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
  const path = `${onboarding.organization_id}/${caseId.data}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await admin.storage.from("intake").upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) redirect(`/ops/import?case=${caseId.data}&error=upload`);

  const modelSettings = getAiModelSettings("import");
  const { data: job, error: jobError } = await admin.from("ai_jobs").insert({
    organization_id: onboarding.organization_id,
    onboarding_case_id: caseId.data,
    kind: "menu_import",
    model: modelSettings.model,
    prompt_version: MENU_IMPORT_PROMPT_VERSION,
    status: "queued",
    attempts: 0,
    input: {
      storage_bucket: "intake",
      storage_path: path,
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      reasoning_effort: modelSettings.reasoningEffort,
    },
    created_by: context.profile.id,
  }).select("id").single();
  if (jobError || !job) {
    await admin.storage.from("intake").remove([path]);
    redirect(`/ops/import?case=${caseId.data}&error=queue`);
  }

  const { error: caseUpdateError } = await admin.from("onboarding_cases")
    .update({ status: "ready", source_file_path: path })
    .eq("id", caseId.data)
    .eq("organization_id", onboarding.organization_id);
  if (caseUpdateError) {
    await Promise.all([
      admin.from("ai_jobs").delete().eq("id", job.id),
      admin.storage.from("intake").remove([path]),
    ]);
    redirect(`/ops/import?case=${caseId.data}&error=case-update`);
  }
  revalidatePath("/ops");
  redirect(`/ops/import?case=${caseId.data}&uploaded=1&job=${job.id}`);
}
