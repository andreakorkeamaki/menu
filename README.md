# MenuInterattivo

SaaS multi-tenant per menu e mini-siti multilingua di ristoranti. Il progetto usa Next.js, Supabase e OpenAI, con onboarding assistito, pubblicazioni versionate e QR stabile.

## Funzioni MVP

- menu e mini-sito pubblico localizzato;
- organizzazioni, membership e isolamento RLS;
- dashboard mobile per menu, sito, traduzioni, aspetto e QR;
- pannello operatore per provisioning, importazione e controllo qualità;
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

Non applicare la nuova migrazione in produzione finché `supabase db reset` e `npm run db:test`
non passano su un ambiente isolato. AppOrdini e il suo database non fanno parte di questa
procedura e non devono essere modificati.

1. Crea un backup del progetto Supabase di MenuInterattivo e prova
   `supabase/migrations/20260715185706_onboarding_import_translation_flow.sql` su un branch o
   progetto di staging.
2. Esegui, nell'ordine, `supabase db reset`, `npm run db:test`, `npm run check` e
   `npm run test:e2e`.
3. Configura su Vercel le variabili server di `.env.example`. `OPENAI_API_KEY`,
   `OPENAI_WEBHOOK_SECRET` e `SUPABASE_SECRET_KEY` non devono mai avere il prefisso
   `NEXT_PUBLIC_`.
4. Imposta `PLATFORM_OPERATOR_EMAILS` con l'email esatta di Andrea. Al primo accesso valido
   il server registra o riattiva l'utente in `platform_staff`; RLS continua ad autorizzare
   esclusivamente dalla tabella, non da `user_metadata`.
5. In Supabase disabilita il signup pubblico, imposta Site URL e callback Auth, quindi verifica
   che il bucket `intake` sia privato.
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
piatto/allergene/variante, approva la bozza, genera e approva le traduzioni, pubblica lo
snapshot e verifica sia `/r/[slug]` sia il QR restituito dal provisioning. Senza le quattro
variabili di credenziali il test pilota viene saltato; i test pubblici restano eseguibili.
