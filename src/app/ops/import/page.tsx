import { uploadIntakeMaterial } from "@/app/ops/actions";
import { requireOperator } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";

function relationName(value: { name?: string } | { name?: string }[] | null | undefined) {
  return (Array.isArray(value) ? value[0]?.name : value?.name) ?? "Ristorante";
}

function formatJobError(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "Errore non dettagliato";
  }
}

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ case?: string; uploaded?: string; job?: string; warning?: string; error?: string }> }) {
  const params = await searchParams;
  await requireOperator();
  const supabase = await createClient();
  const [{ data: cases }, { data: jobs }] = await Promise.all([
    supabase!.from("onboarding_cases").select("id,status,contact_email,source_file_path,created_at,organization:organizations(name),location:locations(name)").order("created_at", { ascending: false }).limit(50),
    supabase!.from("ai_jobs").select("id,onboarding_case_id,status,model,error,created_at,completed_at").order("created_at", { ascending: false }).limit(50),
  ]);
  const selected = (cases ?? []).find((entry) => entry.id === params.case) ?? (cases ?? [])[0];
  return (
    <main className="workspace wide-workspace">
      <header className="workspace-heading"><div><p className="eyebrow">Importazioni</p><h1>Dalla fonte alla bozza strutturata</h1><p>Il file resta privato; l’AI produce staging e problemi da revisionare, mai una pubblicazione.</p></div></header>
      {params.uploaded && <p className="form-success" role="status">Materiale caricato. Job {params.job ? <code>{params.job.slice(0, 8)}</code> : "importazione"} accodato, senza pubblicazione automatica.</p>}{params.error && <p className="form-error">Caricamento non riuscito: {params.error}.</p>}
      {params.warning === "onboarding-metadata" && <p className="form-error" role="status">Ristorante creato correttamente; i dati di contatto del caso non sono stati salvati. Puoi continuare con i materiali e completarli in seguito.</p>}
      <div className="import-layout"><aside className="dashboard-panel case-list"><div className="panel-heading"><div><p className="eyebrow">Casi</p><h2>Seleziona cliente</h2></div></div>{(cases ?? []).map((entry) => <a className={entry.id === selected?.id ? "active" : ""} href={`/ops/import?case=${entry.id}`} key={entry.id}><strong>{relationName(entry.location) || relationName(entry.organization)}</strong><small>{entry.status}</small></a>)}</aside>
        <section className="dashboard-panel import-workspace">{selected ? <><div className="panel-heading"><div><p className="eyebrow">Materiali</p><h2>{relationName(selected.location) || relationName(selected.organization)}</h2></div></div><form action={uploadIntakeMaterial} className="upload-dropzone"><input type="hidden" name="case_id" value={selected.id} /><label><strong>Carica menu o documento</strong><span>PDF, CSV, XLSX, DOCX, JPG, PNG o WEBP · massimo 20 MB</span><input name="file" type="file" accept=".pdf,.csv,.xlsx,.doc,.docx,.jpg,.jpeg,.png,.webp" required /></label><button className="button button-dark">Carica in area privata</button></form><div className="job-list"><h3>Elaborazioni</h3>{(jobs ?? []).filter((job) => job.onboarding_case_id === selected.id).map((job) => { const jobError = formatJobError(job.error); return <article key={job.id}><span className={`status-dot status-${job.status}`} /><div><strong>{job.model}</strong><small>{formatDateTime(job.created_at)}</small></div><span className="status-pill">{job.status}</span>{jobError && <p>{jobError}</p>}</article>; })}</div></> : <div className="empty-state"><h2>Nessun caso disponibile</h2><p>Crea prima un ristorante pilota.</p></div>}</section></div>
    </main>
  );
}
