"use client";

import { ProtectedRouteError } from "@/components/protected-route-error";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ProtectedRouteError area="dashboard" error={error} reset={reset} />;
}
