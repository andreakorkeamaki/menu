import { NextResponse } from "next/server";
import { runTranslationBatch } from "@/lib/ai/translation-batch";
import {
  createTranslationBatchRepository,
  loadTranslationCandidates,
} from "@/lib/ai/translation-repository";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isCrossSite(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return true;
  const origin = request.headers.get("origin");
  return Boolean(origin && origin !== new URL(request.url).origin);
}

async function execute() {
  const userClient = await createClient();
  if (!userClient) {
    return { status: 503, error: "Supabase non configurato." } as const;
  }
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return { status: 401, error: "Sessione non valida." } as const;
  }

  const { data: membership, error: membershipError } = await userClient
    .from("memberships")
    .select("organization_id,role")
    .eq("user_id", authData.user.id)
    .in("role", ["owner", "editor"])
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (membershipError) {
    return { status: 500, error: membershipError.message } as const;
  }
  if (!membership) {
    return { status: 403, error: "Nessuna organizzazione modificabile." } as const;
  }

  try {
    const candidates = await loadTranslationCandidates(
      userClient,
      membership.organization_id,
    );
    if (!candidates.length) {
      return { status: 200, results: [], requested: 0, saved: 0 } as const;
    }

    const results = await runTranslationBatch({
      organizationId: membership.organization_id,
      userId: authData.user.id,
      candidates,
      repository: createTranslationBatchRepository(
        userClient,
        createAdminClient(),
      ),
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
  if (isCrossSite(request)) {
    const destination = new URL("/dashboard/translations", request.url);
    destination.searchParams.set("translation_error", "cross-site");
    return NextResponse.redirect(destination, 303);
  }
  const result = await execute();
  if (result.status === 401) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

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

export async function POST(request: Request) {
  if (isCrossSite(request)) {
    return Response.json({ error: "Richiesta cross-site rifiutata." }, { status: 403 });
  }
  const result = await execute();
  return Response.json(result, { status: result.status });
}
