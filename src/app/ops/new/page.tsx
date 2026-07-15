import { provisionOrganization } from "@/app/ops/actions";

export default async function NewRestaurantPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="workspace">
      <header className="workspace-heading"><div><p className="eyebrow">Provisioning</p><h1>Crea un ristorante in pochi passaggi</h1><p>Il tenant nasce con sede, menu, tema, QR, owner e caso onboarding.</p></div></header>
      <form action={provisionOrganization} className="dashboard-panel stack-form provision-form">
        {params.error && <p className="form-error">Provisioning non riuscito ({params.error}). Nessun menu è stato pubblicato.</p>}
        <div className="field-grid"><label>Organizzazione<input name="organization_name" placeholder="Osteria del Portico SRL" required /></label><label>Nome pubblico<input name="location_name" placeholder="Osteria del Portico" required /></label></div>
        <label>Slug pubblico<input name="slug" placeholder="osteria-del-portico" pattern="[a-zA-Z0-9 -]+" required /><small>Diventerà /r/osteria-del-portico; il QR resta separato.</small></label>
        <div className="field-grid"><label>Responsabile<input name="contact_name" placeholder="Nome e cognome" /></label><label>Email proprietario<input name="owner_email" type="email" required /></label></div>
        <aside className="form-note"><strong>Cosa verrà creato</strong><p>Tenant isolato, sede attiva, menu vuoto, tema Editoriale, QR stabile, membership owner e checklist onboarding.</p></aside>
        <button className="button button-dark">Crea e continua con i materiali</button>
      </form>
    </main>
  );
}
