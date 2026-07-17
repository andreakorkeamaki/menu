import Link from "next/link";
import { notFound } from "next/navigation";
import { assignRestaurantOwner } from "@/app/ops/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { requireOperator } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { requireSuccessfulQueries } from "@/lib/supabase/query-health";

const errorMessages: Record<string, string> = {
  "invalid-owner": "Inserisci un nome e un’email validi per il nuovo proprietario.",
  "operator-owner": "L’email dell’operatore non può essere usata come account ristorante.",
  organization: "Il ristorante non esiste più o non è accessibile.",
  invite: "Non è stato possibile trovare o invitare il nuovo proprietario.",
  membership: "L’account esiste, ma non è stato possibile collegarlo al ristorante.",
};

type RestaurantAccessRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  memberships: Array<{
    id: string;
    user_id: string;
    role: "owner" | "editor";
    profile: { full_name: string } | Array<{ full_name: string }> | null;
  }> | null;
};

export default async function RestaurantAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ owner?: string; cleanup?: string; error?: string }>;
}) {
  const [{ organizationId }, query] = await Promise.all([params, searchParams]);
  const context = await requireOperator();
  const supabase = await createClient();
  const restaurantResult = await supabase!.from("organizations")
    .select("id,name,slug,status,memberships(id,user_id,role,profile:profiles(full_name))")
    .eq("id", organizationId)
    .maybeSingle();
  requireSuccessfulQueries("ops_restaurant_access_load_failed", restaurantResult);
  if (!restaurantResult.data) notFound();
  const restaurant = restaurantResult.data as unknown as RestaurantAccessRow;
  const members = restaurant.memberships ?? [];

  return (
    <main className="workspace">
      <header className="workspace-heading">
        <div>
          <p className="eyebrow">Accessi ristorante</p>
          <h1>{restaurant.name}</h1>
          <p>Associa qui l’account cliente. L’operatore continuerà a lavorare soltanto nel pannello operativo.</p>
        </div>
        <Link className="button button-light" href="/ops/restaurants">← Tutti i ristoranti</Link>
      </header>

      {query.owner ? (
        <p className="form-success" role="status">
          {query.owner === "existing" ? "Account esistente collegato come proprietario." : "Invito inviato e accesso proprietario predisposto."}
          {query.cleanup === "removed" ? " La precedente membership dell’operatore è stata rimossa." : ""}
        </p>
      ) : null}
      {query.cleanup === "retained" ? <p className="form-error" role="alert">Il nuovo proprietario è attivo, ma la vecchia membership operatore non è stata rimossa automaticamente. L’operatore resta comunque escluso dalla dashboard.</p> : null}
      {query.error ? <p className="form-error" role="alert">{errorMessages[query.error] ?? "Operazione non riuscita. Nessun accesso è stato modificato."}</p> : null}

      <div className="settings-grid">
        <section className="dashboard-panel team-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Accessi attuali</p><h2>Chi può aprire la dashboard</h2></div>
            <span className="count-badge">{members.filter((member) => member.user_id !== context.profile.id).length}</span>
          </div>
          <div className="member-list">
            {members.map((member) => {
              const profile = Array.isArray(member.profile) ? member.profile[0] : member.profile;
              const isCurrentOperator = member.user_id === context.profile.id;
              const name = profile?.full_name || (isCurrentOperator ? context.profile.full_name : "Utente invitato");
              return (
                <article key={member.id}>
                  <span className="avatar">{name.charAt(0).toLocaleUpperCase("it")}</span>
                  <div className="member-identity">
                    <div><strong>{name}</strong>{isCurrentOperator ? <span>Operatore</span> : null}</div>
                    <small>{isCurrentOperator ? "Membership storica · dashboard comunque bloccata" : member.role === "owner" ? "Proprietario · controllo completo" : "Editor · contenuti e pubblicazione"}</small>
                  </div>
                  <span className={`status-pill ${member.role === "owner" ? "is-owner" : ""}`}>{isCurrentOperator ? "Da separare" : member.role === "owner" ? "Proprietario" : "Editor"}</span>
                </article>
              );
            })}
            {!members.length ? <div className="empty-state"><h3>Nessun accesso</h3><p>Associa un proprietario per rendere utilizzabile la dashboard ristorante.</p></div> : null}
          </div>
        </section>

        <form action={assignRestaurantOwner} className="dashboard-panel stack-form invite-panel">
          <input type="hidden" name="organization_id" value={restaurant.id} />
          <div className="panel-heading"><div><p className="eyebrow">Account separato</p><h2>Associa il proprietario</h2></div></div>
          <label>Nome e cognome<input name="full_name" autoComplete="name" placeholder="Andrea — account test" required /></label>
          <label>Email ristorante<input name="email" type="email" autoComplete="email" placeholder="ristorante-test@example.com" required /><small>Non può essere un’email presente in PLATFORM_OPERATOR_EMAILS.</small></label>
          <aside className="form-note"><strong>Cosa succede</strong><p>Se l’account esiste, viene collegato subito; altrimenti riceve un invito. Diventa owner del ristorante e l’eventuale vecchia membership del tuo account operatore viene rimossa.</p></aside>
          <PendingSubmitButton className="button button-dark" pendingLabel="Associazione…">Associa come proprietario</PendingSubmitButton>
        </form>
      </div>
    </main>
  );
}
