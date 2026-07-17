"use client";

import Link from "next/link";

const referencePattern = /Reference ([0-9a-f-]{36})/i;

export function ProtectedRouteError({
  area,
  error,
  reset,
}: {
  area: "dashboard" | "ops";
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const loggedReference = error.message.match(referencePattern)?.[1];
  const reference = loggedReference ?? error.digest;
  const isOperator = area === "ops";

  return (
    <main className="workspace protected-data-error">
      <section role="alert" aria-labelledby="protected-data-error-title">
        <span aria-hidden="true">!</span>
        <div>
          <p className="eyebrow">Dati temporaneamente non disponibili</p>
          <h1 id="protected-data-error-title">Non mostriamo informazioni incomplete.</h1>
          <p>{isOperator ? "La coda operativa potrebbe non essere aggiornata. Riprova prima di avviare nuove lavorazioni." : "La versione online e le modifiche già salvate restano al sicuro. Riprova senza reinserire i dati."}</p>
          <div className="inline-actions">
            <button className="button button-dark" onClick={reset}>Riprova ora</button>
            <Link className="button button-light" href={isOperator ? "/ops" : "/dashboard"}>Torna al pannello</Link>
          </div>
          {reference ? <small>Riferimento assistenza: <code>{reference.slice(0, 36)}</code></small> : null}
        </div>
      </section>
    </main>
  );
}
