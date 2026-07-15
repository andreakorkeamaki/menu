import { saveLocation, saveTheme } from "@/app/dashboard/actions";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function SitePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const params = await searchParams;
  const { membership } = await requireMembership();
  const supabase = await createClient();
  const orgId = membership.organization_id;
  const [locationResult, themeResult, qrResult] = await Promise.all([
    supabase!.from("locations").select("*").eq("organization_id", orgId).limit(1).maybeSingle(),
    supabase!.from("themes").select("*").eq("organization_id", orgId).limit(1).maybeSingle(),
    supabase!.from("qr_codes").select("short_code,is_active").eq("organization_id", orgId).eq("is_active", true).limit(1).maybeSingle(),
  ]);
  const location = locationResult.data;
  const theme = themeResult.data;
  return (
    <main className="workspace">
      <header className="workspace-heading"><div><p className="eyebrow">Sito e aspetto</p><h1>La casa digitale del ristorante</h1><p>Contatti, tono e grafica alimentano il mini-sito in ogni lingua.</p></div>{location?.slug && <a className="button button-light" href={`/r/${location.slug}`} target="_blank">Anteprima ↗</a>}</header>
      {params.saved && <p className="form-success">Impostazioni salvate in bozza.</p>}{params.error && <p className="form-error">Controlla i campi evidenziati e riprova.</p>}
      {location ? <div className="settings-grid">
        <form action={saveLocation} className="dashboard-panel stack-form settings-form">
          <input type="hidden" name="id" value={location.id} />
          <div className="panel-heading"><div><p className="eyebrow">Contenuti</p><h2>Informazioni del locale</h2></div></div>
          <div className="field-grid"><label>Nome pubblico<input name="name" defaultValue={location.name ?? ""} required /></label><label>Slug<input name="slug" defaultValue={location.slug ?? ""} required /></label></div>
          <label>Frase di apertura<input name="tagline_it" defaultValue={location.tagline_it ?? ""} /></label>
          <label>Descrizione<textarea name="description_it" rows={5} defaultValue={location.description_it ?? ""} /></label>
          <div className="field-grid"><label>Indirizzo<input name="address" defaultValue={location.address ?? ""} /></label><label>Città<input name="city" defaultValue={location.city ?? ""} /></label><label>Telefono<input name="phone" defaultValue={location.phone ?? ""} /></label><label>Email<input name="email" type="email" defaultValue={location.email ?? ""} /></label></div>
          <label>WhatsApp URL<input name="whatsapp_url" type="url" defaultValue={location.whatsapp_url ?? ""} /></label><label>Prenotazione esterna<input name="reservation_url" type="url" defaultValue={location.reservation_url ?? ""} /></label><label>Mappa URL<input name="map_url" type="url" defaultValue={location.map_url ?? ""} /></label><label>Instagram URL<input name="instagram_url" type="url" defaultValue={location.instagram_url ?? ""} /></label>
          <button className="button button-dark">Salva informazioni</button>
        </form>
        <div className="settings-side">
          {theme && <form action={saveTheme} className="dashboard-panel stack-form"><input type="hidden" name="id" value={theme.id} /><div className="panel-heading"><div><p className="eyebrow">Tema</p><h2>Direzione visiva</h2></div></div><label><input type="radio" name="theme_key" value="editorial" defaultChecked={theme.theme_key !== "minimal"} /> Trattoria editoriale</label><label><input type="radio" name="theme_key" value="minimal" defaultChecked={theme.theme_key === "minimal"} /> Contemporaneo minimale</label><label>Colore accento<input name="accent" type="color" defaultValue={theme.accent ?? "#9d3d2e"} /></label><button className="button button-light">Salva tema</button></form>}
          <section className="dashboard-panel qr-card"><p className="eyebrow">QR stabile</p><h2>{qrResult.data?.short_code ?? "Non ancora generato"}</h2><p>Il codice punta sempre alla destinazione corrente, anche se lo slug cambierà.</p>{qrResult.data && <a href={`/q/${qrResult.data.short_code}`} target="_blank">Prova redirect ↗</a>}</section>
        </div>
      </div> : <section className="empty-state"><h2>Sede non configurata</h2><p>Completa il provisioning dal pannello operatore.</p></section>}
    </main>
  );
}
