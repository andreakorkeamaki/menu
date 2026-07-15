import { AppShell } from "@/components/app-shell";
import { ConfigurationNotice } from "@/components/configuration-notice";
import { requireMembership } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!hasSupabaseEnv()) return <main className="centered-page"><ConfigurationNotice /></main>;
  const context = await requireMembership();
  return <AppShell context={context} area="dashboard">{children}</AppShell>;
}
