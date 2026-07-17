const SAFE_BASE_URL = "https://menuinterattivo.invalid";

export function safeInternalPath(value: string | null | undefined, fallback = "/access") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }

  try {
    const base = new URL(SAFE_BASE_URL);
    const candidate = new URL(value, base);
    if (candidate.origin !== base.origin) return fallback;
    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return fallback;
  }
}
