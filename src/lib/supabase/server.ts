import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/supabase/config";

export async function createClient() {
  if (!hasSupabaseEnv()) return null;
  const cookieStore = await cookies();
  const { url, key } = getSupabaseEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Proxy refreshes cookies when called from a Server Component.
        }
      },
    },
  });
}
