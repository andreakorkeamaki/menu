import Link from "next/link";
import { Brand } from "@/components/brand";

export default function HomePage() {
  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="Navigazione principale">
        <Brand />
        <div className="landing-nav-actions">
          <Link href="/r/demo">Apri la demo</Link>
          <Link className="button button-dark" href="/login">Area clienti</Link>
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
            <Link className="button button-accent" href="/r/demo">Esplora il ristorante demo</Link>
            <a className="text-link" href="#come-funziona">Come funziona <span aria-hidden="true">↓</span></a>
          </div>
          <dl className="hero-facts">
            <div><dt>5</dt><dd>lingue pronte</dd></div>
            <div><dt>1</dt><dd>QR che non cambia</dd></div>
            <div><dt>&lt;90′</dt><dd>onboarding standard</dd></div>
          </dl>
        </div>
        <div className="landing-preview" aria-label="Anteprima MenuInterattivo">
          <div className="preview-browser-bar"><i /><i /><i /><span>menuinterattivo.it/r/osteria</span></div>
          <div className="preview-card">
            <p className="preview-kicker">Osteria del Portico</p>
            <h2>Cucina bolognese,<br />senza fretta.</h2>
            <div className="preview-languages"><span>IT</span><span>EN</span><span>FR</span><span>DE</span><span>ES</span></div>
            <div className="preview-menu-row"><span>Tagliatelle al ragù</span><strong>€16</strong></div>
            <div className="preview-menu-row"><span>Tortelloni burro e salvia</span><strong>€17</strong></div>
          </div>
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
    </main>
  );
}
