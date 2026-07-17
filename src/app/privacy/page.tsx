import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";

export const metadata: Metadata = { title: "Informativa privacy" };

export default function PrivacyPage() {
  const legalName = process.env.NEXT_PUBLIC_LEGAL_NAME ?? "MenuInterattivo";
  const legalAddress = process.env.NEXT_PUBLIC_LEGAL_ADDRESS;
  const privacyEmail = process.env.NEXT_PUBLIC_PRIVACY_EMAIL ?? "ciao@menuinterattivo.it";

  return (
    <main className="legal-page">
      <nav><Brand /><Link href="/">Torna al sito</Link></nav>
      <article>
        <p className="eyebrow">Privacy</p>
        <h1>Informativa per le richieste demo</h1>
        <p className="legal-updated">Ultimo aggiornamento: 17 luglio 2026</p>
        <p>Questa informativa descrive come MenuInterattivo tratta i dati inviati tramite il modulo di richiesta demo.</p>
        <h2>Dati raccolti e finalità</h2>
        <p>Raccogliamo i dati di contatto, le informazioni sul ristorante e gli eventuali link o messaggi che scegli di inviare. Li usiamo esclusivamente per valutare la richiesta, ricontattarti e preparare una proposta pertinente.</p>
        <h2>Base del trattamento</h2>
        <p>Trattiamo i dati della richiesta per svolgere attività precontrattuali avviate da te. Le misure tecniche contro spam e abusi si basano sul nostro legittimo interesse a mantenere il servizio sicuro e disponibile. Non vendiamo i dati e non li utilizziamo per invii promozionali non collegati alla richiesta senza un consenso separato.</p>
        <h2>Sicurezza del modulo</h2>
        <p>Per limitare invii automatizzati o ripetuti, l’indirizzo di rete della connessione e l’email vengono trasformati sul server in identificatori tecnici pseudonimi mediante una chiave segreta. L’indirizzo di rete in chiaro non viene salvato nel database dell’applicazione. Lo stato delle quote viene eliminato dopo 7 giorni; gli esiti tecnici minimizzati, privi del contenuto della richiesta, dopo 90 giorni.</p>
        <h2>Conservazione e accesso</h2>
        <p>I dati sono accessibili soltanto al personale autorizzato e vengono conservati per il tempo necessario a gestire il contatto e gli eventuali passaggi successivi. Se la collaborazione non prosegue, la richiesta viene eliminata o anonimizzata entro 12 mesi.</p>
        <h2>I tuoi diritti</h2>
        <p>Puoi chiedere accesso, correzione o cancellazione dei dati, oppure opporti al trattamento, scrivendo a <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.</p>
        <h2>Titolare del trattamento</h2>
        <p><strong>{legalName}</strong>{legalAddress ? <> · {legalAddress}</> : null}. Per informazioni o richieste relative alla privacy: <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.</p>
      </article>
    </main>
  );
}
