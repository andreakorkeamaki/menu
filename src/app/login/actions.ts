"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({ email: z.email(), password: z.string().min(8), next: z.string().optional() });

function safeNext(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export async function signIn(formData: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/login?error=invalid");
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=config");
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) redirect("/login?error=credentials");
  redirect(safeNext(parsed.data.next));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(formData: FormData) {
  const email = z.email().safeParse(formData.get("email"));
  if (!email.success) redirect("/login/forgot-password?error=invalid");
  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  await supabase?.auth.resetPasswordForEmail(email.data, { redirectTo: `${origin}/auth/callback?next=/login/reset-password` });
  redirect("/login/forgot-password?sent=1");
}

export async function updatePassword(formData: FormData) {
  const password = z.string().min(8).safeParse(formData.get("password"));
  if (!password.success) redirect("/login/reset-password?error=invalid");
  const supabase = await createClient();
  const { error } = (await supabase?.auth.updateUser({ password: password.data })) ?? { error: new Error("config") };
  if (error) redirect("/login/reset-password?error=expired");
  redirect("/dashboard");
}
