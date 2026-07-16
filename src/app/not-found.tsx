import Link from "next/link";
import { Brand } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <Brand />
      <section aria-labelledby="not-found-title">
        <p className="eyebrow">Pagina non trovata</p>
        <h1 id="not-found-title">Questo menu non è più qui.</h1>
        <p>
          Il link potrebbe essere cambiato oppure il menu non è ancora stato pubblicato.
          Se hai aperto un QR al tavolo, chiedi al personale il codice aggiornato.
        </p>
        <div>
          <Link className="button button-accent" href="/r/demo">Apri il menu demo</Link>
          <Link className="text-link" href="/">Torna a MenuInterattivo</Link>
        </div>
      </section>
    </main>
  );
}
