import { AppShell } from "@/components/app-shell";
import { ConfigurationNotice } from "@/components/configuration-notice";
import { requireMembership } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/supabase/config";

// Tenant membership, the active workspace cookie and every dashboard query must
// be evaluated for the current request rather than captured during a build.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!hasSupabaseEnv()) return <main className="centered-page"><ConfigurationNotice /></main>;
  const context = await requireMembership();
  return <AppShell context={context} activeMembership={context.membership} area="dashboard">{children}</AppShell>;
}
