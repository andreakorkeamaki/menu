import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/supabase/config";

/** Cookie-free client for RLS-protected anonymous reads only. */
export function createPublicClient() {
  if (!hasSupabaseEnv()) return null;
  const { url, key } = getSupabaseEnv();
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
