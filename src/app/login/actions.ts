"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/membership-selection";
import { PasswordSetupSchema } from "@/lib/password-policy";
import { safeInternalPath } from "@/lib/safe-navigation";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({ email: z.email(), password: z.string().min(8), next: z.string().optional() });

export async function signIn(formData: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/login?error=invalid");
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=config");
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) redirect("/login?error=credentials");
  redirect(safeInternalPath(parsed.data.next));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_ORGANIZATION_COOKIE);
  redirect("/login");
}

export async function requestPasswordReset(formData: FormData) {
  const email = z.email().safeParse(formData.get("email"));
  if (!email.success) redirect("/login/forgot-password?error=invalid");
  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", "/login/reset-password?mode=recovery");
  await supabase?.auth.resetPasswordForEmail(email.data, { redirectTo: callback.toString() });
  redirect("/login/forgot-password?sent=1");
}

export async function updatePassword(formData: FormData) {
  const mode = formData.get("mode") === "invite" ? "invite" : "recovery";
  const parsed = PasswordSetupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((issue) => issue.path[0] === "password_confirmation");
    redirect(`/login/reset-password?mode=${mode}&error=${mismatch ? "confirmation" : "weak"}`);
  }
  const supabase = await createClient();
  const { error } = (await supabase?.auth.updateUser({ password: parsed.data.password })) ?? { error: new Error("config") };
  if (error) redirect(`/login/reset-password?mode=${mode}&error=${"code" in error && error.code === "weak_password" ? "weak" : "expired"}`);
  redirect(mode === "invite" ? "/dashboard?welcome=1" : "/dashboard?password_updated=1");
}
