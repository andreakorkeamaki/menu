import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { DemoRequestForm } from "@/components/demo-request-form";

export const metadata: Metadata = {
  title: "Richiedi una demo",
  description: "Raccontaci il tuo ristorante e scopri come trasformare menu, traduzioni e QR in un’esperienza mobile curata.",
};

export default function DemoRequestPage() {
  return (
    <main className="demo-request-page">
      <nav className="demo-request-nav" aria-label="Navigazione richiesta demo">
        <Brand />
        <Link href="/">Torna al sito</Link>
      </nav>
      <div className="demo-request-layout">
        <section className="demo-request-intro">
          <p className="eyebrow">Una demo che parte dal tuo menu</p>
          <h1>Vediamo il tuo ristorante, non una presentazione standard.</h1>
          <p className="demo-request-lead">Condividi il punto di partenza. Ti mostreremo un percorso realistico per pubblicare un menu più chiaro, multilingua e facile da tenere aggiornato.</p>
          <a className="button button-accent demo-request-jump" href="#demo-request-form">Inizia la richiesta <span aria-hidden="true">↓</span></a>
          <ul>
            <li><span>01</span><div><strong>Partiamo da ciò che usi oggi</strong><p>PDF, sito, foto o menu cartaceo: non devi preparare un brief perfetto.</p></div></li>
            <li><span>02</span><div><strong>Mettiamo a fuoco le priorità</strong><p>Lingue, allergeni, identità visiva e velocità di aggiornamento.</p></div></li>
            <li><span>03</span><div><strong>Definiamo il prossimo passo</strong><p>Un percorso assistito, con revisione umana prima della pubblicazione.</p></div></li>
          </ul>
          <p className="demo-request-trust">I tuoi materiali restano privati durante l’analisi e nulla viene pubblicato senza approvazione.</p>
        </section>
        <DemoRequestForm />
      </div>
    </main>
  );
}
