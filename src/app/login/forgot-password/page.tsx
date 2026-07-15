import Link from "next/link";
import { requestPasswordReset } from "../actions";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="centered-page"><form action={requestPasswordReset} className="stack-form auth-card">
      <p className="eyebrow">Recupero accesso</p><h1>Reimposta la password</h1>
      <p>Riceverai un collegamento sicuro all’indirizzo associato al tuo account.</p>
      {params.sent && <p className="form-success" role="status">Se l’indirizzo è registrato, il link è in arrivo.</p>}
      {params.error && <p className="form-error" role="alert">Inserisci un indirizzo email valido.</p>}
      <label>Email<input name="email" type="email" required /></label>
      <button className="button button-dark">Invia link di recupero</button>
      <Link href="/login">Torna all’accesso</Link>
    </form></main>
  );
}
