import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { cache } from "react";
import { accessDestination } from "@/lib/access-destination";
import { ensureAllowlistedOperator } from "@/lib/operator-access";
import { ACTIVE_ORGANIZATION_COOKIE, selectMembership } from "@/lib/membership-selection";
import { createClient } from "@/lib/supabase/server";
import type { Membership, Profile } from "@/types/domain";
import { requireSuccessfulQueries } from "@/lib/supabase/query-health";

export interface UserContext {
  profile: Profile;
  memberships: Membership[];
  isOperator: boolean;
}

async function loadUserContext(): Promise<UserContext | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;

  await ensureAllowlistedOperator(authData.user);

  const [profileResult, membershipResult, operatorResult] = await Promise.all([
    supabase.from("profiles").select("id,full_name,created_at").eq("id", authData.user.id).maybeSingle(),
    supabase
      .from("memberships")
      .select("id,organization_id,user_id,role,organization:organizations(id,name,slug,status)")
      .eq("user_id", authData.user.id),
    supabase.from("platform_staff").select("user_id").eq("user_id", authData.user.id).eq("active", true).maybeSingle(),
  ]);
  requireSuccessfulQueries(
    "authenticated_context_load_failed",
    profileResult, membershipResult, operatorResult,
  );

  const profile = (profileResult.data ?? {
    id: authData.user.id,
    full_name: authData.user.email?.split("@")[0] ?? "Utente",
  }) as Profile;
  return {
    profile,
    memberships: (membershipResult.data ?? []) as unknown as Membership[],
    isOperator: Boolean(operatorResult.data),
  };
}

// Layouts and their pages both enforce access. React's request-scoped cache keeps
// that defense in depth without repeating Auth plus three authorization reads.
export const getUserContext = cache(loadUserContext);

export async function requireUserContext() {
  const context = await getUserContext();
  if (!context) redirect("/login");
  return context;
}

export async function requireMembership() {
  const context = await requireUserContext();
  if (context.isOperator) redirect(accessDestination(context));
  const cookieStore = await cookies();
  const membership = selectMembership(
    context.memberships,
    cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value,
  );
  if (!membership) redirect(accessDestination(context));
  return { ...context, membership };
}

export async function requireOperator() {
  const context = await requireUserContext();
  if (!context.isOperator) redirect(accessDestination(context));
  return context;
}
