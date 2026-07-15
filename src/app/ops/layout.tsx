import { AppShell } from "@/components/app-shell";
import { ConfigurationNotice } from "@/components/configuration-notice";
import { requireOperator } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  if (!hasSupabaseEnv()) return <main className="centered-page"><ConfigurationNotice /></main>;
  const context = await requireOperator();
  return <AppShell context={context} area="ops">{children}</AppShell>;
}
