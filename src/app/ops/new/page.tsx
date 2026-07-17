import Link from "next/link";
import { z } from "zod";
import { provisionOrganization } from "@/app/ops/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { requireOperator } from "@/lib/auth";
import { leadProvisionDefaults } from "@/lib/lead-conversion";
import { createClient } from "@/lib/supabase/server";
import { requireSuccessfulQueries } from "@/lib/supabase/query-health";

const errorMessages: Record<string, string> = {
  invalid: "Controlla nomi, città, slug ed email.",
  "operator-owner": "L’account operatore non può essere anche il proprietario del ristorante. Usa un’email separata per il ristorante di prova.",
  invite: "Non è stato possibile trovare o invitare il proprietario in Supabase Auth.",
  "23505": "Lo slug appartiene già a un altro onboarding.",
  "23503": "L’account Auth non corrisponde all’email del proprietario.",
  "22023": "Controlla la città e i dati di provisioning.",
  P0001: "La richiesta non può essere convertita nello stato corrente.",
  P0002: "La richiesta demo non è più disponibile.",
  "provision-result": "Il database non ha restituito un provisioning completo.",
};

export default async function NewRestaurantPage({ searchParams }: { searchParams: Promise<{ error?: string; lead?: string }> }) {
  const params = await searchParams;
  await requireOperator();
  const leadId = z.uuid().safeParse(params.lead);
  const supabase = await createClient();
  const leadResult = leadId.success
    ? await supabase!.from("demo_requests")
      .select("id,status,restaurant_name,city,contact_name,email,contact_role,desired_languages,notes,organization_id,onboarding_case_id")
      .eq("id", leadId.data)
      .maybeSingle()
    : { data: null };
  if ("error" in leadResult) {
    requireSuccessfulQueries("ops_lead_provisioning_load_failed", leadResult);
  }
  const lead = leadResult.data;
  const defaults = lead ? leadProvisionDefaults(lead) : null;

  if (lead?.status === "converted" && lead.onboarding_case_id) {
    return (
      <main className="workspace">
        <section className="conversion-complete-state">
          <span aria-hidden="true">✓</span><p className="eyebrow">Richiesta già convertita</p><h1>{lead.restaurant_name}</h1><p>Questa richiesta è già collegata a un tenant e a un onboarding. Non verrà creato alcun duplicato.</p>
          <div><Link className="button button-dark" href={`/ops/import?case=${lead.onboarding_case_id}`}>Apri onboarding</Link><Link className="button button-light" href="/ops/leads">Torna alle richieste</Link></div>
        </section>
      </main>
    );
  }

  const unavailable = Boolean(params.lead && (!leadId.success || !lead));
  const closed = lead?.status === "closed";
  return (
    <main className="workspace">
      <header className="workspace-heading"><div><p className="eyebrow">Provisioning</p><h1>{lead ? `Trasforma ${lead.restaurant_name} in un ristorante attivo` : "Crea un ristorante in pochi passaggi"}</h1><p>{lead ? "I dati del contatto sono già pronti. Conferma identità pubblica e accesso proprietario, senza ricopiare nulla." : "Il tenant nasce con sede, menu, tema, QR, owner e caso onboarding."}</p></div>{lead ? <Link className="button button-light" href="/ops/leads">← Torna alla richiesta</Link> : null}</header>
      {lead ? (
        <section className="lead-conversion-context" aria-label="Richiesta demo selezionata">
          <div><p className="eyebrow">Richiesta di partenza</p><strong>{lead.contact_name}</strong><a href={`mailto:${lead.email}`}>{lead.email}</a></div>
          <div><span>Città</span><strong>{lead.city}</strong></div>
          <div><span>Ruolo</span><strong>{lead.contact_role === "owner" ? "Titolare" : lead.contact_role === "manager" ? "Responsabile" : "Contatto"}</strong></div>
          <div><span>Lingue</span><strong>{Array.isArray(lead.desired_languages) && lead.desired_languages.length ? lead.desired_languages.map((locale) => locale.toUpperCase()).join(" · ") : "Da definire"}</strong></div>
        </section>
      ) : null}
      {unavailable ? <p className="form-error" role="alert">La richiesta selezionata non esiste o non è accessibile. Puoi comunque creare un provisioning manuale.</p> : null}
      {closed ? <p className="form-error" role="alert">Questa richiesta è chiusa. Riportala prima a “Qualificata” dalla coda per convertirla.</p> : null}
      <form action={provisionOrganization} className="dashboard-panel stack-form provision-form">
        {lead ? <input type="hidden" name="demo_request_id" value={lead.id} /> : null}
        {params.error && <p className="form-error" role="alert">{errorMessages[params.error] ?? "Provisioning non riuscito: nessuna modifica parziale è stata conservata."} Nessun menu è stato pubblicato.</p>}
        <div className="field-grid"><label>Organizzazione<input name="organization_name" defaultValue={defaults?.organizationName ?? ""} placeholder="Osteria del Portico SRL" required /></label><label>Nome pubblico<input name="location_name" defaultValue={defaults?.locationName ?? ""} placeholder="Osteria del Portico" required /></label></div>
        <div className="field-grid"><label>Città<input name="city" defaultValue={defaults?.city ?? ""} autoComplete="address-level2" placeholder="Bologna" required /></label><label>Slug pubblico<input name="slug" defaultValue={defaults?.slug ?? ""} placeholder="osteria-del-portico" pattern="[a-zA-Z0-9 -]+" required /><small>Diventerà /r/osteria-del-portico; il QR resta separato.</small></label></div>
        <div className="field-grid"><label>Responsabile<input name="contact_name" defaultValue={defaults?.contactName ?? ""} placeholder="Nome e cognome" /></label><label>Email proprietario<input name="owner_email" defaultValue={defaults?.ownerEmail ?? ""} type="email" required /><small>Deve essere un account ristorante separato dall’operatore.</small></label></div>
        <aside className="form-note"><strong>{lead ? "Una conferma, un solo passaggio" : "Cosa verrà creato"}</strong><p>{lead ? "Tenant, owner, sede, menu, tema, QR e onboarding verranno creati insieme; la richiesta sarà collegata automaticamente come Convertita." : "Tenant isolato, sede attiva, menu vuoto, tema Editoriale, QR stabile, membership owner e checklist onboarding."}</p></aside>
        <PendingSubmitButton className="button button-dark" pendingLabel="Creazione del ristorante…" disabled={closed}>{lead ? "Conferma e avvia l’onboarding" : "Crea e continua con i materiali"}</PendingSubmitButton>
      </form>
    </main>
  );
}
