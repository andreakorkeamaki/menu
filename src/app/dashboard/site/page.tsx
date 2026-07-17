import Link from "next/link";
import { deleteBrandMedia, saveLocation } from "@/app/dashboard/actions";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OpeningHoursEditor } from "@/components/dashboard/opening-hours-editor";
import { BrandMediaUploader } from "@/components/dashboard/brand-media-uploader";
import { requireSuccessfulQueries } from "@/lib/supabase/query-health";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { AccessibleThemeEditor } from "@/components/dashboard/accessible-theme-editor";

function isOpeningHoursRow(row: unknown): row is { days: string; hours: string } {
  if (!row || typeof row !== "object") return false;
  const candidate = row as Record<string, unknown>;
  return typeof candidate.days === "string" && typeof candidate.hours === "string";
}

const mediaErrorCopy: Record<string, string> = {
  invalid: "Scegli un’immagine valida e riprova.",
  "too-large": "L’immagine supera 8 MB. Esportala in una dimensione più leggera e riprova.",
  type: "Il contenuto del file non corrisponde a un’immagine JPG, PNG o WebP valida.",
  location: "La sede selezionata non è disponibile per il tuo account.",
  upload: "Il caricamento privato non è riuscito. Riprova tra poco.",
  metadata: "L’immagine è stata rimossa perché non è stato possibile registrarla per la revisione.",
  "not-removable": "Puoi ritirare solo immagini ancora in revisione.",
  delete: "Non è stato possibile ritirare l’immagine.",
};

const siteErrorCopy: Record<string, string> = {
  "invalid-site": "Controlla informazioni, orari e collegamenti: almeno un campo non è valido.",
  "save-site": "Le informazioni non sono state salvate. Aggiorna la pagina e riprova.",
  "invalid-theme": "Scegli un tema e un colore accento validi.",
  "save-theme": "Il tema non è stato salvato. Aggiorna la pagina e riprova.",
  "theme-contrast": "Il colore scelto non garantisce una lettura sicura. Scegli un accento con contrasto almeno 4,5:1.",
};

export default async function SitePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; media_uploaded?: string; media_deleted?: string; media_error?: string }> }) {
  const params = await searchParams;
  const { membership } = await requireMembership();
  const supabase = await createClient();
  const orgId = membership.organization_id;
  const [locationResult, themeResult, qrResult, mediaResult] = await Promise.all([
    supabase!.from("locations").select("*").eq("organization_id", orgId).limit(1).maybeSingle(),
    supabase!.from("themes").select("*").eq("organization_id", orgId).limit(1).maybeSingle(),
    supabase!.from("qr_codes").select("short_code,is_active").eq("organization_id", orgId).eq("is_active", true).limit(1).maybeSingle(),
    supabase!.from("media_assets")
      .select("id,bucket_id,object_path,media_kind,alt_text,approval_status,is_public,created_at")
      .eq("organization_id", orgId)
      .in("media_kind", ["logo", "cover"])
      .order("created_at", { ascending: false })
      .limit(12),
  ]);
  requireSuccessfulQueries(
    "dashboard_site_load_failed",
    locationResult, themeResult, qrResult, mediaResult,
  );
  const location = locationResult.data;
  const theme = themeResult.data;
  const openingHours = Array.isArray(location?.opening_hours)
    ? location.opening_hours.filter(isOpeningHoursRow)
    : [];
  const media = await Promise.all((mediaResult.data ?? []).map(async (asset) => {
    if (asset.approval_status === "rejected") return { ...asset, previewUrl: null };
    if (asset.bucket_id === "public-media") {
      const { data } = supabase!.storage.from("public-media").getPublicUrl(asset.object_path);
      return { ...asset, previewUrl: data.publicUrl };
    }
    const { data } = await supabase!.storage.from("intake").createSignedUrl(asset.object_path, 15 * 60);
    return { ...asset, previewUrl: data?.signedUrl ?? null };
  }));
  return (
    <main className="workspace">
      <header className="workspace-heading"><div><p className="eyebrow">Sito e aspetto</p><h1>La casa digitale del ristorante</h1><p>Contatti, tono e grafica alimentano il mini-sito in ogni lingua.</p></div>{location && <div className="workspace-heading-actions"><Link className="button button-dark" href="/dashboard/menu/preview">Anteprima bozza ↗</Link>{location.slug && <a className="button button-light" href={`/r/${location.slug}`} target="_blank" rel="noreferrer">Sito online ↗</a>}</div>}</header>
      {params.saved && <p className="form-success" role="status">Impostazioni salvate in bozza. Controllale nell’anteprima: il sito online non è cambiato.</p>}{params.error && <p className="form-error" role="alert">{siteErrorCopy[params.error] ?? "L’operazione non è riuscita. Controlla i dati e riprova."}</p>}
      {params.media_uploaded && <p className="form-success" role="status">Immagine caricata nello spazio privato. La renderemo pubblica solo dopo il controllo dell’operatore.</p>}
      {params.media_deleted && <p className="form-success" role="status">Immagine ritirata dalla revisione.</p>}
      {params.media_error && <p className="form-error" role="alert">{mediaErrorCopy[params.media_error] ?? "L’operazione sull’immagine non è riuscita."}</p>}
      {location ? <div className="settings-grid">
        <form action={saveLocation} className="dashboard-panel stack-form settings-form">
          <input type="hidden" name="id" value={location.id} />
          <div className="panel-heading"><div><p className="eyebrow">Contenuti</p><h2>Informazioni del locale</h2></div></div>
          <div className="field-grid"><label>Nome pubblico<input name="name" defaultValue={location.name ?? ""} required /></label><label>Slug<input name="slug" defaultValue={location.slug ?? ""} required /></label></div>
          <label>Frase di apertura<input name="tagline_it" defaultValue={location.tagline_it ?? ""} /></label>
          <label>Descrizione<textarea name="description_it" rows={5} defaultValue={location.description_it ?? ""} /></label>
          <OpeningHoursEditor initialRows={openingHours} />
          <div className="field-grid"><label>Indirizzo<input name="address" defaultValue={location.address ?? ""} /></label><label>Città<input name="city" defaultValue={location.city ?? ""} /></label><label>Telefono<input name="phone" defaultValue={location.phone ?? ""} /></label><label>Email<input name="email" type="email" defaultValue={location.email ?? ""} /></label></div>
          <label>WhatsApp URL<input name="whatsapp_url" type="url" defaultValue={location.whatsapp_url ?? ""} /></label><label>Prenotazione esterna<input name="reservation_url" type="url" defaultValue={location.reservation_url ?? ""} /></label><label>Mappa URL<input name="map_url" type="url" defaultValue={location.map_url ?? ""} /></label><label>Instagram URL<input name="instagram_url" type="url" defaultValue={location.instagram_url ?? ""} /></label>
          <PendingSubmitButton className="button button-dark" pendingLabel="Salvataggio informazioni…">Salva informazioni</PendingSubmitButton>
        </form>
        <div className="settings-side">
          {theme && <AccessibleThemeEditor theme={theme} />}
          <section className="dashboard-panel qr-card">
            <p className="eyebrow">QR stabile</p>
            {qrResult.data ? (
              <>
                {/* Generated on our own origin; the QR always encodes the stable /q/ route. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/q/${qrResult.data.short_code}/image`} alt={`QR del menu ${location.name}`} />
                <h2>Pronto per la stampa</h2>
                <p>Il QR codifica il percorso stabile <strong>/q/{qrResult.data.short_code}</strong>. Puoi aggiornare menu o slug senza ristamparlo.</p>
                <div className="qr-actions">
                  <a className="button button-dark" href={`/q/${qrResult.data.short_code}/image?download=1`}>Scarica SVG</a>
                  <a className="button button-light" href={`/q/${qrResult.data.short_code}`} target="_blank">Prova scansione ↗</a>
                </div>
                <small>SVG vettoriale · correzione errore alta · adatto a stampa e vetrofanie</small>
              </>
            ) : (
              <><h2>Non ancora generato</h2><p>Completa il provisioning per ottenere il QR stabile.</p></>
            )}
          </section>
        </div>
      </div> : <section className="empty-state"><h2>Sede non configurata</h2><p>Completa il provisioning dal pannello operatore.</p></section>}
      {location && (
        <section className="dashboard-panel brand-media-section" aria-labelledby="brand-media-title">
          <div className="panel-heading brand-media-heading">
            <div><p className="eyebrow">Immagini del brand</p><h2 id="brand-media-title">Riconoscibile, prima ancora di leggere</h2><p>Carica logo e copertina in un’area privata. Un operatore controlla qualità e diritti prima della pubblicazione.</p></div>
            <span className="review-safety-badge">Revisione inclusa</span>
          </div>
          <div className="brand-upload-grid">
            <BrandMediaUploader kind="logo" locationId={location.id} label="Logo" description="Preferisci un marchio leggibile anche in piccolo, con sfondo semplice o trasparente." />
            <BrandMediaUploader kind="cover" locationId={location.id} label="Foto di copertina" description="Scegli una foto orizzontale autentica: sala, cucina o un piatto che racconti davvero il locale." />
          </div>
          <div className="brand-media-history">
            <div className="brand-media-history-heading"><div><h3>Stato delle immagini</h3><p>L’approvazione aggiorna la bozza; il sito pubblico cambia solo con la prossima pubblicazione del menu.</p></div><span>{media.length}</span></div>
            {media.length ? (
              <div className="brand-media-list">
                {media.map((asset) => (
                  <article key={asset.id} className="brand-media-row">
                    <div className={`brand-media-thumb brand-media-thumb-${asset.media_kind}`}>
                      {asset.previewUrl ? (
                        // Signed private previews expire after 15 minutes.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={asset.previewUrl} alt={asset.alt_text || `Anteprima ${asset.media_kind === "logo" ? "logo" : "copertina"}`} />
                      ) : <span aria-hidden="true">×</span>}
                    </div>
                    <div><strong>{asset.media_kind === "logo" ? "Logo" : "Foto di copertina"}</strong><small>{asset.alt_text || "Nessun testo descrittivo"}</small></div>
                    <span className={`media-status media-status-${asset.approval_status}`}>
                      {asset.is_public ? "Approvata e attiva" : asset.approval_status === "draft" ? "In revisione" : asset.approval_status === "approved" ? "Approvata" : "Non approvata"}
                    </span>
                    {asset.approval_status === "draft" ? (
                      <form action={deleteBrandMedia}><input type="hidden" name="asset_id" value={asset.id} /><button className="text-button danger-text-button">Ritira</button></form>
                    ) : <span className="brand-media-locked">{asset.is_public ? "Inclusa nella bozza" : "Storico"}</span>}
                  </article>
                ))}
              </div>
            ) : <div className="brand-media-empty"><strong>Nessuna immagine caricata</strong><p>Inizia dal logo: è il dettaglio che rende il sito subito riconoscibile.</p></div>}
          </div>
        </section>
      )}
    </main>
  );
}
