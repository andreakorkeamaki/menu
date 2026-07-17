import { reportServerError } from "@/lib/server-telemetry";

interface QueryResultLike {
  error: unknown;
}

export function failProtectedQuery(event: string, error: unknown): never {
  const reference = reportServerError(event, error);
  throw new Error(`Protected data unavailable. Reference ${reference}.`);
}

export function requireSuccessfulQueries(event: string, ...results: QueryResultLike[]) {
  const failed = results.find((result) => result.error);
  if (!failed) return;
  failProtectedQuery(event, failed.error);
}
