import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { signIn } from "./actions";

export const metadata: Metadata = { title: "Accedi" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  const errors: Record<string, string> = {
    invalid: "Controlla email e password.", credentials: "Credenziali non valide.", config: "Supabase non è ancora configurato.", "no-membership": "Il tuo account non è associato a un ristorante.",
  };
  return (
    <main className="auth-page">
      <section className="auth-panel auth-intro">
        <Brand />
        <div><p className="eyebrow">Area riservata</p><h1>Il menu cambia con te, non con il QR.</h1><p>Aggiorna prezzi, disponibilità e contenuti da telefono. La versione pubblicata resta sempre sotto controllo.</p></div>
        <Link href="/r/demo">Guarda il ristorante demo →</Link>
      </section>
      <section className="auth-panel auth-form-panel">
        <form action={signIn} className="stack-form">
          <div><p className="eyebrow">Bentornato</p><h2>Accedi alla dashboard</h2></div>
          {params.error && <p className="form-error" role="alert">{errors[params.error] ?? "Accesso non riuscito."}</p>}
          <input type="hidden" name="next" value={params.next ?? "/dashboard"} />
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" minLength={8} autoComplete="current-password" required /></label>
          <button className="button button-dark">Accedi</button>
          <Link className="text-link" href="/login/forgot-password">Hai dimenticato la password?</Link>
        </form>
      </section>
    </main>
  );
}
