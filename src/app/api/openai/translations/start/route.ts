import { NextResponse } from "next/server";
import { z } from "zod";
import { runTranslationBatch, type TargetLocale } from "@/lib/ai/translation-batch";
import { TRANSLATION_BATCH_LIMIT } from "@/lib/ai/translation-limits";
import {
  createTranslationBatchRepository,
  loadTranslationCandidates,
} from "@/lib/ai/translation-repository";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SelectionSchema = z.object({
  translationIds: z.array(z.uuid()).max(TRANSLATION_BATCH_LIMIT),
  locales: z.array(z.enum(["en", "fr", "de", "es"])).max(4),
});

function isCrossSite(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return true;
  const origin = request.headers.get("origin");
  return Boolean(origin && origin !== new URL(request.url).origin);
}

async function readSelection(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json();
    return SelectionSchema.parse({
      translationIds: Array.isArray(body.translation_ids) ? body.translation_ids : [],
      locales: Array.isArray(body.locales) ? body.locales : [],
    });
  }
  const form = await request.formData();
  return SelectionSchema.parse({
    translationIds: form.getAll("translation_id").map(String),
    locales: form.getAll("locale").map(String),
  });
}

async function execute(selection: z.infer<typeof SelectionSchema>) {
  const userClient = await createClient();
  if (!userClient) return { status: 503, error: "Supabase non configurato." } as const;
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return { status: 401, error: "Sessione non valida." } as const;

  const { data: membership, error: membershipError } = await userClient
    .from("memberships")
    .select("organization_id,role")
    .eq("user_id", authData.user.id)
    .in("role", ["owner", "editor"])
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (membershipError) return { status: 500, error: membershipError.message } as const;
  if (!membership) return { status: 403, error: "Nessuna organizzazione modificabile." } as const;

  try {
    let candidates = await loadTranslationCandidates(userClient, membership.organization_id);
    if (selection.translationIds.length) {
      const selectedIds = new Set(selection.translationIds);
      candidates = candidates.filter((candidate) => selectedIds.has(candidate.id));
    }
    if (selection.locales.length) {
      const selectedLocales = new Set<TargetLocale>(selection.locales);
      candidates = candidates.filter((candidate) => selectedLocales.has(candidate.locale));
    }
    if (!candidates.length) return { status: 200, results: [], requested: 0, saved: 0 } as const;

    const results = await runTranslationBatch({
      organizationId: membership.organization_id,
      userId: authData.user.id,
      candidates,
      repository: createTranslationBatchRepository(userClient, createAdminClient()),
    });
    return {
      status: results.some((result) => result.error) ? 502 : 200,
      results,
      requested: results.reduce((sum, result) => sum + result.requested, 0),
      saved: results.reduce((sum, result) => sum + result.saved, 0),
    } as const;
  } catch (error) {
    return {
      status: 500,
      error: error instanceof Error ? error.message : "Generazione traduzioni non riuscita.",
    } as const;
  }
}

export async function GET(request: Request) {
  const destination = new URL("/dashboard/translations", request.url);
  destination.searchParams.set("translation_error", "use-post");
  return NextResponse.redirect(destination, 303);
}

export async function POST(request: Request) {
  if (isCrossSite(request)) {
    return Response.json({ error: "Richiesta cross-site rifiutata." }, { status: 403 });
  }
  let selection: z.infer<typeof SelectionSchema>;
  try {
    selection = await readSelection(request);
  } catch {
    return Response.json({ error: "Selezione traduzioni non valida." }, { status: 400 });
  }
  const result = await execute(selection);
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return Response.json(result, { status: result.status });
  }
  if (result.status === 401) return NextResponse.redirect(new URL("/login", request.url), 303);

  const destination = new URL("/dashboard/translations", request.url);
  if ("error" in result) {
    destination.searchParams.set("translation_error", "failed");
  } else {
    destination.searchParams.set("generated", String(result.saved));
    destination.searchParams.set("requested", String(result.requested));
    if (result.status !== 200) destination.searchParams.set("translation_error", "partial");
  }
  return NextResponse.redirect(destination, 303);
}
