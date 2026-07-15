import { redirect } from "next/navigation";
import { ensureAllowlistedOperator } from "@/lib/operator-access";
import { createClient } from "@/lib/supabase/server";
import type { Membership, Profile } from "@/types/domain";

export interface UserContext {
  profile: Profile;
  memberships: Membership[];
  isOperator: boolean;
}

export async function getUserContext(): Promise<UserContext | null> {
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

export async function requireUserContext() {
  const context = await getUserContext();
  if (!context) redirect("/login");
  return context;
}

export async function requireMembership() {
  const context = await requireUserContext();
  const membership = context.memberships[0];
  if (!membership) redirect(context.isOperator ? "/ops" : "/login?error=no-membership");
  return { ...context, membership };
}

export async function requireOperator() {
  const context = await requireUserContext();
  if (!context.isOperator) redirect("/dashboard");
  return context;
}
