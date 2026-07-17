import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/supabase/config";

export async function updateSession(request: NextRequest) {
  if (!hasSupabaseEnv()) return NextResponse.next({ request });
  let response = NextResponse.next({ request });
  const { url, key } = getSupabaseEnv();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const protectedPath = request.nextUrl.pathname.startsWith("/dashboard")
    || request.nextUrl.pathname.startsWith("/ops")
    || request.nextUrl.pathname === "/access";
  if (protectedPath && !data?.claims) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(target);
  }
  return response;
}
