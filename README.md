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

Configurare su Vercel le variabili di `.env.example`. In Supabase disabilitare il signup pubblico, impostare il Site URL, aggiungere gli URL di callback e configurare il webhook OpenAI `response.completed` su `/api/openai/webhook`.
