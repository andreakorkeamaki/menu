"use client";

import Link from "next/link";
import { useActionState } from "react";
import { submitDemoRequest, type DemoRequestFormState } from "@/app/richiedi-demo/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";

const initialState: DemoRequestFormState = { status: "idle" };

export function DemoRequestForm() {
  const [state, formAction] = useActionState(submitDemoRequest, initialState);

  if (state.status === "success") {
    return (
      <section className="demo-success" aria-live="polite">
        <span aria-hidden="true">✓</span>
        <p className="eyebrow">Richiesta ricevuta</p>
        <h2>Adesso guardiamo il tuo menu.</h2>
        <p>Ti ricontatteremo usando i recapiti indicati per capire priorità, lingue e materiale disponibile.</p>
        <ol>
          <li><strong>Controlliamo</strong><span>menu, presenza online e informazioni inviate</span></li>
          <li><strong>Ci sentiamo</strong><span>per definire obiettivi e tempi senza una demo generica</span></li>
          <li><strong>Prepariamo</strong><span>un percorso concreto per il tuo ristorante</span></li>
        </ol>
        <Link className="button button-light" href="/r/demo">Nel frattempo, esplora la demo</Link>
      </section>
    );
  }

  const issue = (name: string) => state.issues?.[name]?.[0];
  const invalid = (name: string) => Boolean(issue(name));

  return (
    <form action={formAction} className="demo-request-form" id="demo-request-form" noValidate>
      <div className="demo-form-heading">
        <p className="eyebrow">Parliamo del tuo ristorante</p>
        <h2>Richiedi una demo su misura</h2>
        <p>Ci bastano due minuti. Nessuna carta, nessun impegno.</p>
      </div>

      {state.status === "error" ? <p className="form-error" role="alert">{state.message}</p> : null}

      <div className="field-grid">
        <label>
          Nome del ristorante
          <input name="restaurant_name" required aria-invalid={invalid("restaurant_name")} aria-describedby={invalid("restaurant_name") ? "restaurant-name-error" : undefined} />
          {issue("restaurant_name") ? <small className="field-error" id="restaurant-name-error">{issue("restaurant_name")}</small> : null}
        </label>
        <label>
          Città
          <input name="city" autoComplete="address-level2" required aria-invalid={invalid("city")} aria-describedby={invalid("city") ? "city-error" : undefined} />
          {issue("city") ? <small className="field-error" id="city-error">{issue("city")}</small> : null}
        </label>
      </div>

      <div className="field-grid">
        <label>
          Il tuo nome
          <input name="contact_name" autoComplete="name" required aria-invalid={invalid("contact_name")} aria-describedby={invalid("contact_name") ? "contact-name-error" : undefined} />
          {issue("contact_name") ? <small className="field-error" id="contact-name-error">{issue("contact_name")}</small> : null}
        </label>
        <label>
          Ruolo
          <select name="contact_role" defaultValue="" required aria-invalid={invalid("contact_role")} aria-describedby={invalid("contact_role") ? "contact-role-error" : undefined}>
            <option value="" disabled>Seleziona</option>
            <option value="owner">Titolare</option>
            <option value="manager">Responsabile</option>
            <option value="consultant">Consulente o agenzia</option>
            <option value="other">Altro</option>
          </select>
          {issue("contact_role") ? <small className="field-error" id="contact-role-error">{issue("contact_role")}</small> : null}
        </label>
      </div>

      <div className="field-grid">
        <label>
          Email di lavoro
          <input name="email" type="email" autoComplete="email" inputMode="email" required aria-invalid={invalid("email")} aria-describedby={invalid("email") ? "email-error" : undefined} />
          {issue("email") ? <small className="field-error" id="email-error">{issue("email")}</small> : null}
        </label>
        <label>
          Telefono <span className="optional-label">facoltativo</span>
          <input name="phone" type="tel" autoComplete="tel" inputMode="tel" aria-invalid={invalid("phone")} />
        </label>
      </div>

      <label>
        Link al menu attuale <span className="optional-label">facoltativo</span>
        <input name="current_menu_url" type="url" inputMode="url" placeholder="https://…" aria-invalid={invalid("current_menu_url")} aria-describedby={invalid("current_menu_url") ? "menu-url-error" : "menu-url-help"} />
        {issue("current_menu_url") ? <small className="field-error" id="menu-url-error">{issue("current_menu_url")}</small> : <small id="menu-url-help">Sito, PDF pubblico o pagina social: ci aiuta a rendere il primo confronto concreto.</small>}
      </label>

      <fieldset className="demo-language-options">
        <legend>Lingue che ti interessano <span className="optional-label">facoltativo</span></legend>
        <label><input type="checkbox" name="desired_languages" value="en" /> Inglese</label>
        <label><input type="checkbox" name="desired_languages" value="fr" /> Francese</label>
        <label><input type="checkbox" name="desired_languages" value="de" /> Tedesco</label>
        <label><input type="checkbox" name="desired_languages" value="es" /> Spagnolo</label>
      </fieldset>

      <label>
        Cosa vuoi migliorare? <span className="optional-label">facoltativo</span>
        <textarea name="notes" rows={4} maxLength={2000} placeholder="Per esempio: traduzioni, aggiornamenti rapidi, nuovo QR…" />
      </label>

      <label className="honeypot-field" aria-hidden="true">
        Azienda
        <input name="company" tabIndex={-1} autoComplete="off" />
      </label>

      <label className="privacy-consent">
        <input type="checkbox" name="privacy_consent" required aria-invalid={invalid("privacy_consent")} aria-describedby={invalid("privacy_consent") ? "privacy-error" : undefined} />
        <span>Ho letto l’<Link href="/privacy" target="_blank" rel="noreferrer">informativa privacy</Link> e chiedo di essere ricontattato per questa richiesta.</span>
      </label>
      {issue("privacy_consent") ? <small className="field-error" id="privacy-error">{issue("privacy_consent")}</small> : null}

      <PendingSubmitButton className="button button-accent demo-submit" pendingLabel="Invio della richiesta…">
        Invia la richiesta
      </PendingSubmitButton>
      <p className="demo-form-fallback">Preferisci l’email? <a href="mailto:ciao@menuinterattivo.it">ciao@menuinterattivo.it</a></p>
    </form>
  );
}
