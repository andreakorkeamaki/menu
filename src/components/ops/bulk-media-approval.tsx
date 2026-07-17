"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type BulkAsset = { id: string; name: string };
type AssetResult = { status: "queued" | "running" | "approved" | "failed"; error?: string };

export function bulkApprovalSummary(results: Record<string, AssetResult>) {
  return Object.values(results).reduce(
    (summary, result) => ({
      approved: summary.approved + (result.status === "approved" ? 1 : 0),
      failed: summary.failed + (result.status === "failed" ? 1 : 0),
      completed: summary.completed + (["approved", "failed"].includes(result.status) ? 1 : 0),
    }),
    { approved: 0, failed: 0, completed: 0 },
  );
}

export function BulkMediaApproval({
  assets,
  organizationId,
  menuId,
  contextLabel,
}: {
  assets: BulkAsset[];
  organizationId: string;
  menuId: string;
  contextLabel: string;
}) {
  const router = useRouter();
  const runningRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [runTotal, setRunTotal] = useState(0);
  const [results, setResults] = useState<Record<string, AssetResult>>({});
  const summary = bulkApprovalSummary(results);
  const percent = runTotal ? Math.round((summary.completed / runTotal) * 100) : 0;

  async function approveAll() {
    if (
      runningRef.current
      || !assets.length
      || !window.confirm(`Approva ${assets.length} ${assets.length === 1 ? "immagine" : "immagini"} per ${contextLabel}? Ogni file verrà ricontrollato singolarmente.`)
    ) return;
    runningRef.current = true;
    setRunning(true);
    setRunTotal(assets.length);
    setResults(Object.fromEntries(assets.map((asset) => [asset.id, { status: "queued" as const }])));

    let cursor = 0;
    async function worker() {
      while (cursor < assets.length) {
        const asset = assets[cursor++];
        setResults((current) => ({ ...current, [asset.id]: { status: "running" } }));
        try {
          const response = await fetch("/api/ops/media/review", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              asset_id: asset.id,
              organization_id: organizationId,
              menu_id: menuId,
              action: "approve",
            }),
          });
          const payload = await response.json() as { error?: string };
          if (!response.ok) throw new Error(payload.error || "Approvazione non riuscita.");
          setResults((current) => ({ ...current, [asset.id]: { status: "approved" } }));
        } catch (error) {
          setResults((current) => ({
            ...current,
            [asset.id]: {
              status: "failed",
              error: error instanceof Error ? error.message : "Approvazione non riuscita.",
            },
          }));
        }
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(2, assets.length) }, () => worker()));
      router.refresh();
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  return (
    <section className="bulk-media-approval" aria-busy={running}>
      <div>
        <p className="eyebrow">Menu corrente</p>
        <h2>{contextLabel}</h2>
        <p>{assets.length} {assets.length === 1 ? "foto prodotto privata" : "foto prodotto private"} in attesa in questo menu. Il comando non include loghi, copertine o media di altri ristoranti.</p>
      </div>
      <button className="button button-accent" type="button" onClick={() => void approveAll()} disabled={running || assets.length === 0}>
        {running ? `Approvazione · ${summary.completed}/${runTotal}` : `Approva tutto (${assets.length})`}
      </button>
      {(running || summary.completed > 0) ? (
        <div className="bulk-media-progress" role="status" aria-live="polite">
          <div><strong>{summary.approved} approvate</strong>{summary.failed ? <span> · {summary.failed} non riuscite</span> : null}<span> · {summary.completed}/{runTotal}</span></div>
          <div className="menu-image-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={runTotal} aria-valuenow={summary.completed} aria-label="Avanzamento approvazione immagini"><span style={{ width: `${percent}%` }} /></div>
          {summary.failed ? <p>Le approvazioni riuscite restano valide; puoi riprovare singolarmente quelle non riuscite.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
