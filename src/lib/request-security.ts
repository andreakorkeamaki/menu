import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export function clientAddressFromHeaders(requestHeaders: Pick<Headers, "get">) {
  const forwarded = requestHeaders.get("x-vercel-forwarded-for")
    ?? requestHeaders.get("x-forwarded-for")
    ?? requestHeaders.get("x-real-ip");
  if (!forwarded) return null;
  const candidate = forwarded.split(",")[0]?.trim();
  return candidate && isIP(candidate) ? candidate : null;
}

export function requestFingerprint(secret: string, namespace: "ip" | "email", value: string) {
  if (secret.length < 24) throw new Error("Public form fingerprint secret is too short");
  return createHmac("sha256", secret)
    .update(`menuinterattivo:demo-request:v1:${namespace}\0`)
    .update(value.trim().toLocaleLowerCase("en-US"))
    .digest("hex");
}

export function getPublicFormFingerprintSecret() {
  const secret = process.env.FORM_ABUSE_HASH_SECRET ?? process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Public form fingerprint secret is not configured");
  return secret;
}

export function retryMinutes(seconds: number) {
  return Math.max(1, Math.ceil(seconds / 60));
}
