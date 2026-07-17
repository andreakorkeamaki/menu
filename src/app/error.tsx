"use client";

import Link from "next/link";
import { Brand } from "@/components/brand";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const reference = error.digest?.slice(0, 12);
  return (
    <main className="runtime-error-page">
      <Brand />
      <section aria-labelledby="runtime-error-title">
        <span aria-hidden="true">!</span>
        <p className="eyebrow">Interruzione temporanea</p>
        <h1 id="runtime-error-title">Questa pagina non si è caricata come previsto.</h1>
        <p>Le modifiche già salvate restano al sicuro. Puoi riprovare senza reinserire i dati oppure tornare alla pagina iniziale.</p>
        <div><button className="button button-accent" onClick={reset}>Riprova</button><Link className="button button-light" href="/">Torna alla home</Link></div>
        {reference ? <small>Riferimento assistenza: {reference}</small> : null}
      </section>
    </main>
  );
}
