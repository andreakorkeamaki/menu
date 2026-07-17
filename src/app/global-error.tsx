"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="it">
      <body style={{ margin: 0, color: "#19201c", background: "#f3f5f2", fontFamily: "Inter, system-ui, sans-serif" }}>
        <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: "1.5rem" }}>
          <section style={{ width: "min(100%, 38rem)", padding: "clamp(2rem, 7vw, 4rem)", border: "1px solid #dfe4df", borderRadius: "1.25rem", background: "#fff", textAlign: "center" }}>
            <p style={{ color: "#a54232", fontSize: ".72rem", fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase" }}>MenuInterattivo</p>
            <h1 style={{ margin: ".6rem 0", fontFamily: "Georgia, serif", fontSize: "clamp(2.2rem, 8vw, 4rem)", fontWeight: 500, lineHeight: 1 }}>Il servizio ha bisogno di un nuovo tentativo.</h1>
            <p style={{ color: "#5f6862", lineHeight: 1.6 }}>La versione pubblicata e i dati già salvati non vengono modificati da questo errore.</p>
            <button onClick={reset} style={{ minHeight: "3rem", padding: ".75rem 1.2rem", border: 0, borderRadius: ".75rem", color: "#fff", background: "#a54232", cursor: "pointer", fontWeight: 800 }}>Ricarica l’applicazione</button>
            {error.digest ? <small style={{ display: "block", marginTop: "1rem", color: "#7a837d" }}>Riferimento: {error.digest.slice(0, 12)}</small> : null}
          </section>
        </main>
      </body>
    </html>
  );
}
