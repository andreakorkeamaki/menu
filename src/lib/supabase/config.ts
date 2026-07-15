function isValidHttpUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function hasSupabaseEnv() {
  return Boolean(
    isValidHttpUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !isValidHttpUrl(url)) {
    throw new Error("Supabase non configurato: controlla URL e publishable key.");
  }
  return { url, key };
}

export function getSupabaseSecretEnv() {
  const { url } = getSupabaseEnv();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY non configurata.");
  return { url, key };
}
