import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

function canonicalEmail(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

export function parseOperatorEmailAllowlist(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(/[;,\n]/)
      .map(canonicalEmail)
      .filter(Boolean),
  );
}

export function isAllowlistedOperatorEmail(
  email: string | null | undefined,
  configured = process.env.PLATFORM_OPERATOR_EMAILS,
) {
  if (!email) return false;
  return parseOperatorEmailAllowlist(configured).has(canonicalEmail(email));
}

/**
 * Bootstrap allowlisted platform operators into the database-backed authorization table.
 * RLS continues to authorize only through platform_staff; email never becomes a JWT/RLS claim.
 */
export async function ensureAllowlistedOperator(
  user: Pick<User, "id" | "email">,
  admin?: SupabaseClient,
) {
  if (!isAllowlistedOperatorEmail(user.email)) return false;
  const client = admin ?? createAdminClient();
  const { error } = await client.from("platform_staff").upsert(
    {
      user_id: user.id,
      role: "operator",
      active: true,
      created_by: user.id,
    },
    { onConflict: "user_id" },
  );
  if (error) {
    throw new Error(`Attivazione operatore non riuscita: ${error.message}`);
  }
  return true;
}
