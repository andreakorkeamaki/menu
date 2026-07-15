import { updatePassword } from "../actions";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="centered-page"><form action={updatePassword} className="stack-form auth-card">
      <p className="eyebrow">Nuova credenziale</p><h1>Scegli una nuova password</h1>
      {params.error && <p className="form-error" role="alert">Il link è scaduto oppure la password è troppo breve.</p>}
      <label>Nuova password<input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
      <button className="button button-dark">Salva password</button>
    </form></main>
  );
}
