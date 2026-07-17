import Link from "next/link";
import { Brand } from "@/components/brand";

const demoRequestHref = "/richiedi-demo";

export default function HomePage() {
  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="Navigazione principale">
        <Brand />
        <div className="landing-nav-actions">
          <a href="#come-funziona">Come funziona</a>
          <Link href="/r/demo">Menu demo</Link>
          <Link className="button button-dark" href={demoRequestHref}>Parliamo del tuo menu</Link>
          <Link href="/login">Accedi</Link>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">Menu, mini-sito e traduzioni</p>
          <h1>Il tuo menu parla la lingua dei tuoi ospiti.</h1>
          <p className="landing-lead">
            Trasformiamo il materiale che hai già in un’esperienza mobile curata, sempre aggiornata e pronta da aprire con un solo QR.
          </p>
          <div className="hero-actions">
            <Link className="button button-accent" href={demoRequestHref}>Richiedi una demo</Link>
            <Link className="text-link" href="/r/demo">Provalo come un ospite <span aria-hidden="true">↗</span></Link>
          </div>
          <dl className="hero-facts">
            <div><dt>5</dt><dd>lingue pronte</dd></div>
            <div><dt>1</dt><dd>QR che non cambia</dd></div>
            <div><dt>&lt;90′</dt><dd>onboarding standard</dd></div>
          </dl>
        </div>
        <div className="landing-preview" aria-label="Anteprima MenuInterattivo">
          <div className="preview-browser-bar"><i /><i /><i /><span>menuinterattivo.it/r/osteria</span><strong>Online</strong></div>
          <div className="preview-card">
            <div className="preview-card-top"><p className="preview-kicker">Osteria del Portico</p><span>Bologna · IT</span></div>
            <h2>Cucina bolognese,<br />senza fretta.</h2>
            <div className="preview-languages"><span>IT</span><span>EN</span><span>FR</span><span>DE</span><span>ES</span></div>
            <div className="preview-menu-row"><span>Tagliatelle al ragù</span><strong>€16</strong></div>
            <div className="preview-menu-row"><span>Tortelloni burro e salvia</span><strong>€17</strong></div>
            <p className="preview-footnote">Ingredienti, allergeni e disponibilità sempre a portata di tavolo.</p>
          </div>
        </div>
      </section>

      <section className="landing-outcomes" aria-labelledby="outcomes-title">
        <div className="landing-outcomes-intro">
          <p className="eyebrow">Un dettaglio che cambia il servizio</p>
          <h2 id="outcomes-title">Meno attrito al tavolo.<br /><em>Più spazio per l’ospitalità.</em></h2>
        </div>
        <div className="outcome-list">
          <article><span>Per chi arriva</span><h3>Capire e scegliere, senza sentirsi fuori posto.</h3><p>Lingua, ingredienti e allergeni sono chiari nel momento in cui servono.</p></article>
          <article><span>Per chi è in sala</span><h3>Le risposte ripetitive non interrompono più il servizio.</h3><p>Il personale resta presente dove conta: consiglio, cura e accoglienza.</p></article>
          <article><span>Per chi gestisce</span><h3>Una modifica sola, visibile subito e senza ristampare il QR.</h3><p>Prezzi e disponibilità cambiano in bozza, poi vanno online solo dopo conferma.</p></article>
        </div>
      </section>

      <section className="landing-process" id="come-funziona">
        <p className="eyebrow">Chiavi in mano</p>
        <h2>Dal PDF al tavolo, senza un altro gestionale complicato.</h2>
        <div className="process-grid">
          <article><span>01</span><h3>Raccogliamo</h3><p>Menu, logo, foto, orari e lingue in un unico flusso assistito.</p></article>
          <article><span>02</span><h3>Revisioniamo</h3><p>L’AI struttura e traduce; una persona controlla prezzi, termini e allergeni.</p></article>
          <article><span>03</span><h3>Pubblichiamo</h3><p>Il cliente approva, il QR resta stabile e le modifiche future sono immediate.</p></article>
        </div>
      </section>

      <section className="landing-cta" aria-labelledby="landing-cta-title">
        <div className="landing-cta-copy">
          <p className="eyebrow">Per il tuo ristorante</p>
          <h2 id="landing-cta-title">Il materiale esiste già. Facciamolo lavorare meglio.</h2>
        </div>
        <div className="landing-cta-content">
          <p>
            Inviaci il menu che usi oggi. Ti mostriamo come può diventare un’esperienza multilingua curata,
            facile da aggiornare e pronta per il tuo QR.
          </p>
          <div className="landing-cta-actions">
            <Link className="button button-accent" href={demoRequestHref}>Richiedi una demo</Link>
            <a className="landing-email-link" href="mailto:ciao@menuinterattivo.it">ciao@menuinterattivo.it</a>
          </div>
          <small>Onboarding assistito · Nessun nuovo gestionale da imparare · Revisione umana inclusa</small>
        </div>
      </section>

      <footer className="landing-footer">
        <div><Brand /><p>Menu digitali che rispettano l’identità del ristorante e il tempo di chi ci lavora.</p></div>
        <nav aria-label="Navigazione a piè di pagina">
          <div><span>Scopri</span><Link href="/r/demo">Menu demo</Link><a href="#come-funziona">Come funziona</a></div>
          <div><span>Contatti</span><Link href={demoRequestHref}>Richiedi una demo</Link><a href="mailto:ciao@menuinterattivo.it" aria-label="Scrivici via email">ciao@menuinterattivo.it</a></div>
          <div><span>Area riservata</span><Link href="/login">Accedi</Link><Link href="/privacy">Privacy</Link></div>
        </nav>
        <small>© 2026 MenuInterattivo · Fatto per l’ospitalità italiana.</small>
      </footer>
    </main>
  );
}
