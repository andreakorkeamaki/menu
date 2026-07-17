"use client";

import { useState } from "react";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

export function PasswordSetupFields({ hasError = false }: { hasError?: boolean }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const checks = [
    [password.length >= PASSWORD_MIN_LENGTH, `Almeno ${PASSWORD_MIN_LENGTH} caratteri`],
    [/[a-z]/.test(password) && /[A-Z]/.test(password), "Maiuscole e minuscole"],
    [/[0-9]/.test(password), "Almeno un numero"],
    [confirmation.length > 0 && password === confirmation, "Le due password coincidono"],
  ] as const;

  return (
    <>
      <div className="password-field"><label htmlFor="new-password">Nuova password</label><span className="password-input-wrap"><input id="new-password" name="password" type={visible ? "text" : "password"} minLength={PASSWORD_MIN_LENGTH} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby="password-guidance" aria-invalid={hasError || undefined} required /><button type="button" onClick={() => setVisible((current) => !current)} aria-pressed={visible}>{visible ? "Nascondi" : "Mostra"}</button></span></div>
      <div className="password-field"><label htmlFor="confirm-password">Conferma password</label><input id="confirm-password" name="password_confirmation" type={visible ? "text" : "password"} minLength={PASSWORD_MIN_LENGTH} maxLength={128} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} aria-invalid={hasError || undefined} required /></div>
      <div className="password-guidance" id="password-guidance" aria-live="polite">
        {checks.map(([complete, label]) => <span className={complete ? "is-complete" : ""} key={label}><span aria-hidden="true">{complete ? "✓" : "·"}</span>{label}</span>)}
      </div>
    </>
  );
}
