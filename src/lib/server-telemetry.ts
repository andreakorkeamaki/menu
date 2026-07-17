import { randomUUID } from "node:crypto";

export function reportServerError(event: string, error: unknown) {
  const reference = randomUUID();
  const errorCode = error && typeof error === "object" && "code" in error
    ? String(error.code).slice(0, 80)
    : error instanceof Error
      ? error.name
      : "unknown";
  console.error(JSON.stringify({
    level: "error",
    event,
    reference,
    error_code: errorCode,
    occurred_at: new Date().toISOString(),
  }));
  return reference;
}
