export function ConfigurationNotice() {
  return (
    <section className="notice-card" role="status">
      <p className="eyebrow">Configurazione richiesta</p>
      <h1>Collega il nuovo progetto Supabase</h1>
      <p>Copia <code>.env.example</code> in <code>.env.local</code>, inserisci URL e publishable key, quindi applica le migration.</p>
      <pre>supabase start{"\n"}supabase db reset{"\n"}npm run dev</pre>
    </section>
  );
}
