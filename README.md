# MenuInterattivo

SaaS multi-tenant per menu e mini-siti multilingua di ristoranti. Il progetto usa Next.js, Supabase e OpenAI, con onboarding assistito, pubblicazioni versionate e QR stabile.

## Funzioni MVP

- menu e mini-sito pubblico localizzato, con ricerca, filtri alimentari e allergeni dichiarati;
- organizzazioni, membership e isolamento RLS;
- dashboard mobile per menu, sito, traduzioni, aspetto e QR;
- pannello operatore per richieste demo, provisioning, importazione e controllo qualità;
- caricamento privato e approvazione operatore di logo e copertina prima del passaggio nel bucket pubblico;
- import da CSV/XLSX e import assistito da PDF/documenti/immagini;
- traduzioni versionate con fonte italiana e revisione umana;
- temi `editorial` e `minimal`;
- snapshot di pubblicazione immutabili e audit.

Ordini, pagamenti, prenotazioni proprietarie, analytics avanzati, billing e domini personalizzati non fanno parte dell'MVP.

## Avvio locale

```bash
npm install
cp .env.example .env.local
supabase start
supabase db reset
npm run dev
```

Senza variabili Supabase l'applicazione usa una demo pubblica in memoria e mostra un avviso di configurazione nelle aree protette.

## Verifiche

```bash
npm run check
npm run test:e2e
npm run db:test
```

## Deploy

Non applicare nuove migrazioni in produzione finché `supabase db reset` e `npm run db:test`
non passano su un ambiente isolato. AppOrdini e il suo database non fanno parte di questa
procedura e non devono essere modificati.

1. Crea un backup del progetto Supabase di MenuInterattivo e prova
   tutte le migrazioni non ancora applicate su un branch o progetto di staging; verifica l’ordine
   con `supabase migration list --local`.
2. Esegui, nell'ordine, `supabase db reset`, `npm run db:test`, `npm run check` e
   `npm run test:e2e`.
3. Configura su Vercel le variabili server di `.env.example`. `OPENAI_API_KEY`,
   `OPENAI_WEBHOOK_SECRET` e `SUPABASE_SECRET_KEY` non devono mai avere il prefisso
   `NEXT_PUBLIC_`. Compila anche `NEXT_PUBLIC_LEGAL_NAME`, `NEXT_PUBLIC_LEGAL_ADDRESS` e
   `NEXT_PUBLIC_PRIVACY_EMAIL` con i dati reali del titolare prima di rendere pubblico il modulo demo.
   Genera inoltre `FORM_ABUSE_HASH_SECRET` con almeno 32 caratteri casuali: viene usato soltanto
   sul server per trasformare email e indirizzi di rete in fingerprint non reversibili.
4. Imposta `PLATFORM_OPERATOR_EMAILS` con l'email esatta di Andrea. Al primo accesso valido
   il server registra o riattiva l'utente in `platform_staff`; RLS continua ad autorizzare
   esclusivamente dalla tabella, non da `user_metadata`.
5. In Supabase disabilita il signup pubblico, imposta Site URL e la callback Auth esatta, quindi
   richiedi password di almeno 12 caratteri con maiuscole, minuscole e numeri. Abilita la
   protezione dalle password compromesse quando disponibile e verifica che il bucket `intake`
   sia privato.
6. Configura in OpenAI il webhook `response.completed`, `response.failed`,
   `response.incomplete` e `response.cancelled` verso
   `https://<dominio>/api/openai/webhook`. Salva il signing secret soltanto come
   `OPENAI_WEBHOOK_SECRET` server-side.
7. Pubblica prima una preview, esegui il test pilota sotto e promuovi in produzione soltanto
   dopo il risultato positivo.

## Prova end-to-end del ristorante pilota

Il test usa un proprietario Auth già confermato, così verifica anche il percorso che non deve
inviare un secondo invito. Usa credenziali di test dedicate e non commetterle nel repository.

```bash
E2E_BASE_URL=https://preview.example.com \
E2E_OPERATOR_EMAIL=andrea@example.com \
E2E_OPERATOR_PASSWORD='...' \
E2E_OWNER_EMAIL=owner-pilot@example.com \
E2E_OWNER_PASSWORD='...' \
E2E_PILOT_SLUG=ristorante-pilota \
npm run test:e2e -- tests/e2e/onboarding.spec.ts --project=chromium
```

La prova crea o recupera idempotentemente il tenant, importa il CSV in staging, controlla
piatto/allergene/variante, approva la bozza, genera e approva le traduzioni, apre l’anteprima
privata senza SEO, pubblica lo snapshot, verifica `/r/[slug]` e il QR, quindi carica un logo privato e ne prova la promozione
operatore nel flusso media. Senza le quattro variabili di credenziali il test pilota viene
saltato; i test pubblici restano eseguibili.

## Recupero operativo delle importazioni

La pagina `/ops` mostra una salute operativa fail-closed: se i dati di job o webhook non sono
leggibili, lo stato resta “non disponibile” e non diventa verde. Gli alert riguardano import
falliti o fermi nei casi di onboarding ancora aperti e webhook verificati ma non processati.

Per un import fallito:

1. apri `/ops/import`, seleziona il ristorante e annota il riferimento tecnico mostrato nel job;
2. usa **Riprova dal file salvato**: il sistema riutilizza la fonte nel bucket privato `intake`,
   incrementa atomicamente lo stesso job e non crea una seconda coda;
3. non riprovare se esiste già uno staging da revisionare; completa invece la revisione;
4. dopo tre tentativi il recupero è bloccato: verifica log, fonte e configurazione, poi carica
   una nuova fonte soltanto dopo aver corretto la causa;
5. considera l’import riuscito solo quando compare lo staging in revisione. Nessun recupero
   pubblica direttamente il menu.

Il claim del retry è riservato agli operatori, lascia un audit `ai_job.retry_claimed` e mantiene
il documento nel bucket privato. I riferimenti tecnici sono correlabili ai log strutturati senza
mostrare al browser messaggi grezzi del provider.

Per gli import OpenAI, il webhook elimina la copia temporanea dal provider dopo avere salvato
lo stato terminale e prima di chiudere l’evento. Un errore reale di eliminazione lascia il webhook
riprovabile; un `404` è considerato già eliminato. Il job registra `provider_file_released_at`,
rimuove l’identificatore esterno ormai scaduto e mostra all’operatore **Copia temporanea OpenAI
eliminata**. La fonte canonica continua invece a vivere nel bucket privato `intake`, perché serve
alla revisione umana e agli eventuali tentativi autorizzati.

Le aree autenticate non trasformano gli errori di lettura in contatori a zero o code vuote.
Le query indispensabili falliscono in modo esplicito, producono un log strutturato con riferimento
e mostrano nel pannello un recupero contestuale con **Riprova ora**. Le diagnostiche secondarie
(come salute webhook o telemetria intake) possono degradarsi senza nascondere la coda primaria,
ma vengono indicate come non disponibili e registrate nei log. Un import non può essere approvato
se la fonte privata non è apribile tramite URL firmato.

Da `/dashboard/menu/review` il proprietario può aprire una vera anteprima privata della bozza.
La route usa le tabelle normalizzate sotto RLS e lo stesso renderer del sito pubblico, ma non
crea né modifica `menu_publications`, non emette dati strutturati SEO ed è `noindex`. Tema,
immagini approvate, allergeni, varianti e traduzioni approvate sono quelli correnti; il selettore
lingua resta dentro l’anteprima autenticata. Se una lingua ha testi non approvati, la barra della
bozza ne mostra il numero e spiega che quei punti ricadono temporaneamente sull’italiano.

La stessa revisione mostra fino a 20 pubblicazioni recenti, distingue chiaramente la versione
online e consente il ripristino deliberato di una versione precedente. Il ripristino non modifica
lo snapshot scelto e non cancella la versione corrente: `restore_menu_publication` crea una nuova
versione monotona, aggiorna il puntatore del menu e conserva `restored_from_id`. La cache pubblica
e le route QR vengono invalidate/aggiornate subito dopo il successo; in caso di errore il contenuto
online resta invariato.

Il caricamento pubblico distingue inoltre un menu realmente assente da un errore temporaneo di
Supabase o da uno snapshot corrente non valido. Gli errori non vengono convertiti in un falso 404:
producono un riferimento strutturato e una pagina di recupero localizzata nelle cinque lingue,
con nuovo tentativo esplicito e rassicurazione che il QR resta valido. Anche la risoluzione del QR
fallisce in modo osservabile invece di fingere che il codice non esista.
