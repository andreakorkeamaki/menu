import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseSecretEnv } from "@/lib/supabase/config";

export function createAdminClient() {
  const { url, key } = getSupabaseSecretEnv();
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
