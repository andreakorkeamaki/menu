"use client";

import { ProtectedRouteError } from "@/components/protected-route-error";

export default function OpsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ProtectedRouteError area="ops" error={error} reset={reset} />;
}
