import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MediaReviewError, reviewMediaAsset } from "@/lib/media-review";
import { createClient } from "@/lib/supabase/server";

const RequestSchema = z.object({
  asset_id: z.uuid(),
  organization_id: z.uuid(),
  menu_id: z.uuid(),
  action: z.literal("approve"),
});

function isCrossSite(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return true;
  const origin = request.headers.get("origin");
  return Boolean(origin && origin !== new URL(request.url).origin);
}

export async function POST(request: Request) {
  if (isCrossSite(request)) {
    return Response.json({ error: "Richiesta cross-site rifiutata." }, { status: 403 });
  }
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Richiesta non valida." }, { status: 400 });

  const supabase = await createClient();
  if (!supabase) return Response.json({ error: "Supabase non configurato." }, { status: 503 });
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return Response.json({ error: "Sessione non valida." }, { status: 401 });
  const { data: staff, error: staffError } = await supabase.from("platform_staff")
    .select("user_id")
    .eq("user_id", authData.user.id)
    .eq("active", true)
    .maybeSingle();
  if (staffError) return Response.json({ error: "Autorizzazione non disponibile." }, { status: 500 });
  if (!staff) return Response.json({ error: "Accesso operatore richiesto." }, { status: 403 });

  try {
    const result = await reviewMediaAsset({
      assetId: parsed.data.asset_id,
      organizationId: parsed.data.organization_id,
      expectedMenuId: parsed.data.menu_id,
      action: "approve",
      operatorClient: supabase,
    });
    revalidatePath("/ops/media");
    revalidatePath("/dashboard/photos");
    revalidatePath("/dashboard/menu");
    revalidatePath("/dashboard/menu/preview");
    revalidatePath("/dashboard/menu/review");
    return Response.json(result);
  } catch (error) {
    if (error instanceof MediaReviewError) {
      return Response.json({ code: error.code, error: "Questa immagine non è stata approvata." }, { status: 409 });
    }
    return Response.json({ error: "Approvazione non riuscita." }, { status: 500 });
  }
}
