import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") ?? "/dashboard";
  if (code) {
    const supabase = await createClient();
    const { error } = (await supabase?.auth.exchangeCodeForSession(code)) ?? { error: new Error("config") };
    if (!error) return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/dashboard", request.url));
  }
  return NextResponse.redirect(new URL("/login?error=expired", request.url));
}
