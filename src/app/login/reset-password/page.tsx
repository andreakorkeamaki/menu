import { updatePassword } from "../actions";
import { PasswordSetupFields } from "@/components/password-setup-fields";
import { PendingSubmitButton } from "@/components/pending-submit-button";

const errorMessages: Record<string, string> = {
  weak: "Scegli una password più forte e completa tutti i requisiti.",
  confirmation: "Le due password non coincidono. Riprova con calma.",
  expired: "Il link è scaduto o è già stato usato. Richiedine uno nuovo.",
};

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; mode?: string }> }) {
  const params = await searchParams;
  const isInvite = params.mode === "invite";
  return (
    <main className="centered-page"><form action={updatePassword} className="stack-form auth-card">
      <input type="hidden" name="mode" value={isInvite ? "invite" : "recovery"} />
      <p className="eyebrow">{isInvite ? "Il tuo accesso è pronto" : "Proteggi il tuo account"}</p><h1>{isInvite ? "Benvenuto in MenuInterattivo" : "Scegli una nuova password"}</h1><p className="auth-card-intro">{isInvite ? "Un ultimo passaggio: crea una password personale, poi entrerai direttamente nello spazio del tuo ristorante." : "Usa una password unica. Un password manager è il modo più semplice per crearla e conservarla."}</p>
      {params.error && <p className="form-error" role="alert">{errorMessages[params.error] ?? "Non è stato possibile aggiornare la password."}</p>}
      <PasswordSetupFields hasError={Boolean(params.error)} />
      <PendingSubmitButton className="button button-dark" pendingLabel="Protezione dell’account…">{isInvite ? "Entra nel mio ristorante" : "Salva la nuova password"}</PendingSubmitButton>
    </form></main>
  );
}
