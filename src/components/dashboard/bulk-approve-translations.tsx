"use client";

import type { FormEvent } from "react";
import { approveAllTranslations } from "@/app/dashboard/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";

export function BulkApproveTranslations({ count }: { count: number }) {
  function confirmApproval(event: FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        `Vuoi approvare tutte le ${count} bozze pronte? Le righe mancanti, obsolete o in errore non verranno approvate.`,
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <form action={approveAllTranslations} onSubmit={confirmApproval} className="bulk-approval-bar">
      <div>
        <p className="eyebrow">Revisione rapida</p>
        <strong>{count === 1 ? "1 bozza pronta" : `${count} bozze pronte`}</strong>
        <span>Approva in blocco oppure apri il dettaglio sotto se vuoi controllare o correggere qualcosa.</span>
      </div>
      <PendingSubmitButton
        className="button button-accent"
        pendingLabel="Approvazione in corso…"
        disabled={count === 0}
      >
        Approva tutto
      </PendingSubmitButton>
    </form>
  );
}
