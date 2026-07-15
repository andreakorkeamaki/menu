import { inviteMember } from "@/app/dashboard/actions";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ invited?: string; error?: string }> }) {
  const params = await searchParams;
  const { membership } = await requireMembership();
  const supabase = await createClient();
  const { data } = await supabase!.from("memberships").select("id,user_id,role,profile:profiles(full_name)").eq("organization_id", membership.organization_id).order("created_at");
  return (
    <main className="workspace">
      <header className="workspace-heading"><div><p className="eyebrow">Utenti</p><h1>Chi può modificare il menu</h1><p>I proprietari gestiscono gli accessi; gli editor lavorano sui contenuti.</p></div></header>
      {params.invited && <p className="form-success">Invito inviato.</p>}{params.error && <p className="form-error">Invito non riuscito: verifica email e autorizzazioni.</p>}
      <div className="settings-grid">
        <section className="dashboard-panel"><div className="panel-heading"><div><p className="eyebrow">Membri</p><h2>Team attuale</h2></div></div><div className="member-list">{(data ?? []).map((row) => { const p = Array.isArray(row.profile) ? row.profile[0] : row.profile; return <article key={row.id}><span className="avatar">{(p?.full_name ?? "U").charAt(0)}</span><div><strong>{p?.full_name ?? "Utente invitato"}</strong><small>{row.role === "owner" ? "Proprietario" : "Editor"}</small></div></article>; })}</div></section>
        {membership.role === "owner" && <form action={inviteMember} className="dashboard-panel stack-form"><div className="panel-heading"><div><p className="eyebrow">Nuovo accesso</p><h2>Invita una persona</h2></div></div><label>Email<input name="email" type="email" required /></label><label>Ruolo<select name="role"><option value="editor">Editor</option><option value="owner">Proprietario</option></select></label><button className="button button-dark">Invia invito</button></form>}
      </div>
    </main>
  );
}
