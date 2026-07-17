import { inviteMember, removeMember, updateMemberRole } from "@/app/dashboard/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { requireSuccessfulQueries } from "@/lib/supabase/query-health";

const errorMessages: Record<string, string> = {
  invite: "L’invito non è partito. Riprova o verifica la configurazione email.",
  membership: "L’account è stato trovato, ma l’accesso non è stato collegato.",
  "owner-only": "Solo un proprietario può modificare gli accessi.",
  "owner-guard": "Per proteggere il ristorante, un proprietario non può modificare il proprio accesso o rimuovere l’ultimo proprietario.",
  "not-found": "Questo accesso non esiste più. La pagina è stata aggiornata.",
  "invalid-member": "La modifica richiesta non è valida.",
  "member-action": "La modifica non è stata applicata. Nessun accesso è cambiato.",
  invalid: "Inserisci un’email valida e scegli un ruolo.",
};

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ invited?: string; member?: string; error?: string }> }) {
  const params = await searchParams;
  const { membership } = await requireMembership();
  const supabase = await createClient();
  const memberResult = await supabase!.from("memberships").select("id,user_id,role,profile:profiles(full_name)").eq("organization_id", membership.organization_id).order("created_at");
  requireSuccessfulQueries("dashboard_team_load_failed", memberResult);
  const members = memberResult.data ?? [];
  return (
    <main className="workspace">
      <header className="workspace-heading"><div><p className="eyebrow">Accessi e responsabilità</p><h1>Il team giusto, con i permessi giusti</h1><p>I proprietari gestiscono sito e accessi. Proprietari ed editor possono aggiornare, revisionare e pubblicare i contenuti.</p></div><span className="count-badge">{members.length} {members.length === 1 ? "persona" : "persone"}</span></header>
      {params.invited && <p className="form-success" role="status">{params.invited === "existing" ? "Accesso collegato: la persona aveva già un account MenuInterattivo." : "Invito inviato. L’accesso è pronto e la persona riceverà il link per impostare la password."}</p>}
      {params.member && <p className="form-success" role="status">{params.member === "removed" ? "Accesso rimosso. La persona non può più aprire questo ristorante." : "Ruolo aggiornato. I nuovi permessi sono già attivi."}</p>}
      {params.error && <p className="form-error" role="alert">{errorMessages[params.error] ?? "Operazione non riuscita."}</p>}
      <div className="settings-grid">
        <section className="dashboard-panel team-panel">
          <div className="panel-heading"><div><p className="eyebrow">Team attuale</p><h2>Chi ha accesso</h2></div></div>
          <div className="member-list">{members.map((row) => {
            const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
            const name = profile?.full_name ?? "Utente invitato";
            const isCurrentUser = row.user_id === membership.user_id;
            return (
              <article key={row.id}>
                <span className="avatar">{name.charAt(0).toLocaleUpperCase("it")}</span>
                <div className="member-identity"><div><strong>{name}</strong>{isCurrentUser ? <span>Tu</span> : null}</div><small>{row.role === "owner" ? "Proprietario · controllo completo" : "Editor · contenuti e pubblicazione"}</small></div>
                {membership.role === "owner" && !isCurrentUser ? (
                  <div className="member-controls">
                    <form action={updateMemberRole} className="member-role-form">
                      <input type="hidden" name="membership_id" value={row.id} />
                      <label><span className="sr-only">Ruolo di {name}</span><select name="role" defaultValue={row.role} aria-label={`Ruolo di ${name}`}><option value="editor">Editor</option><option value="owner">Proprietario</option></select></label>
                      <PendingSubmitButton className="button button-light" pendingLabel="Salvataggio…">Salva</PendingSubmitButton>
                    </form>
                    <details className="member-remove">
                      <summary>Rimuovi</summary>
                      <div><p><strong>Rimuovere {name}?</strong><span>Perderà subito l’accesso a questo ristorante. Il suo account non verrà eliminato.</span></p><form action={removeMember}><input type="hidden" name="membership_id" value={row.id} /><PendingSubmitButton className="button button-light danger-button" pendingLabel="Rimozione…" aria-label={`Conferma la rimozione dell’accesso di ${name}`}>Conferma rimozione</PendingSubmitButton></form></div>
                    </details>
                  </div>
                ) : <span className={`status-pill ${row.role === "owner" ? "is-owner" : ""}`}>{row.role === "owner" ? "Proprietario" : "Editor"}</span>}
              </article>
            );
          })}</div>
          {membership.role === "owner" ? <p className="team-safety-note"><span aria-hidden="true">⌁</span><span><strong>Il tuo accesso resta protetto.</strong> Per cambiare il tuo ruolo, chiedi a un altro proprietario. Il ristorante non può rimanere senza proprietari.</span></p> : null}
        </section>
        {membership.role === "owner" && <form action={inviteMember} className="dashboard-panel stack-form invite-panel"><div className="panel-heading"><div><p className="eyebrow">Nuovo accesso</p><h2>Invita una persona</h2></div></div><label>Email<input name="email" type="email" autoComplete="email" placeholder="nome@ristorante.it" required /></label><label>Ruolo<select name="role" defaultValue="editor"><option value="editor">Editor — contenuti</option><option value="owner">Proprietario — controllo completo</option></select></label><aside className="form-note"><strong>Parti dal minimo necessario</strong><p>Scegli Editor per chi aggiorna e pubblica menu e traduzioni. Assegna Proprietario solo a chi deve gestire anche sito e accessi del team.</p></aside><PendingSubmitButton className="button button-dark" pendingLabel="Invio dell’invito…">Invia invito</PendingSubmitButton></form>}
      </div>
    </main>
  );
}
