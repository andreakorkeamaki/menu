"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface MenuImageGenerationItem {
  id: string;
  name: string;
  hasImage: boolean;
  mediaStatus?: "draft" | "approved" | "rejected";
  assetId?: string;
}

type ItemProgress = {
  status: "queued" | "running" | "saved" | "failed" | "skipped";
  previewUrl?: string | null;
  error?: string;
};

const ROTATING_COPY = [
  "Mantengo luce, inquadratura e sfondo coerenti tra tutti i prodotti.",
  "Ogni risultato viene salvato come bozza privata, mai direttamente online.",
  "Procedo a due prodotti per volta per mantenere stabile la coda di generazione.",
  "La qualità media privilegia una resa naturale adatta alle schede del menu.",
];

export function menuImageProgressCopy(
  elapsedSeconds: number,
  runningNames: string[],
  completed: number,
  total: number,
) {
  if (total === 0) return "Tutte le immagini sono già presenti o in revisione.";
  if (completed === total) return "Generazione completata. Aggiorno le bozze del catalogo.";
  if (elapsedSeconds < 3) return "Preparo le descrizioni visive e avvio la prima coppia di prodotti.";
  const current = runningNames.length
    ? `In lavorazione: ${runningNames.join(" e ")}. `
    : "Preparo i prossimi prodotti. ";
  const rotating = ROTATING_COPY[Math.floor(elapsedSeconds / 7) % ROTATING_COPY.length];
  return `${current}${rotating}`;
}

function isServerEligible(item: MenuImageGenerationItem) {
  return !item.hasImage && item.mediaStatus !== "draft";
}

function progressLabel(progress?: ItemProgress) {
  if (!progress) return null;
  if (progress.status === "queued") return "In coda";
  if (progress.status === "running") return "In lavorazione";
  if (progress.status === "saved") return "In revisione";
  if (progress.status === "skipped") return "Già pronta";
  return "Da riprovare";
}

export function MenuImageGeneration({ items }: { items: MenuImageGenerationItem[] }) {
  const router = useRouter();
  const runningRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [runItemIds, setRunItemIds] = useState<string[]>([]);
  const [progress, setProgress] = useState<Record<string, ItemProgress>>({});
  const [lastSummary, setLastSummary] = useState<{ saved: number; failed: number } | null>(null);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const eligible = items.filter((item) => {
    const local = progress[item.id];
    return isServerEligible(item) && local?.status !== "saved" && local?.status !== "skipped";
  });
  const presentCount = items.filter((item) => item.hasImage).length;
  const reviewCount = items.filter((item) => (
    !item.hasImage
    && (item.mediaStatus === "draft" || ["saved", "skipped"].includes(progress[item.id]?.status))
  )).length;
  const completed = runItemIds.filter((id) => (
    progress[id]?.status === "saved"
    || progress[id]?.status === "failed"
    || progress[id]?.status === "skipped"
  )).length;
  const saved = runItemIds.filter((id) => (
    progress[id]?.status === "saved" || progress[id]?.status === "skipped"
  )).length;
  const failed = runItemIds.filter((id) => progress[id]?.status === "failed").length;
  const runningNames = runItemIds
    .filter((id) => progress[id]?.status === "running")
    .map((id) => itemById.get(id)?.name)
    .filter((name): name is string => Boolean(name));
  const percent = runItemIds.length
    ? Math.round((completed / runItemIds.length) * 100)
    : 0;
  const statusCopy = menuImageProgressCopy(
    elapsedSeconds,
    runningNames,
    completed,
    runItemIds.length,
  );
  const visibleActivity = runItemIds
    .filter((id) => progress[id]?.status === "running" || progress[id]?.status === "failed")
    .concat(
      runItemIds
        .filter((id) => progress[id]?.status === "saved" || progress[id]?.status === "skipped")
        .reverse()
        .slice(0, 4),
    )
    .slice(0, 6);

  async function generateItem(item: MenuImageGenerationItem) {
    setProgress((current) => ({
      ...current,
      [item.id]: { status: "running" },
    }));
    try {
      const response = await fetch("/api/openai/images/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          item_id: item.id,
          replace_asset_id: item.mediaStatus === "rejected" ? item.assetId ?? null : null,
        }),
      });
      const result = await response.json() as {
        code?: string;
        error?: string;
        preview_url?: string | null;
      };
      if (response.ok) {
        setProgress((current) => ({
          ...current,
          [item.id]: { status: "saved", previewUrl: result.preview_url },
        }));
        return true;
      }
      if (["already_has_image", "already_in_review"].includes(result.code ?? "")) {
        setProgress((current) => ({ ...current, [item.id]: { status: "skipped" } }));
        return true;
      }
      throw new Error(result.error || "Generazione non riuscita.");
    } catch (error) {
      setProgress((current) => ({
        ...current,
        [item.id]: {
          status: "failed",
          error: error instanceof Error ? error.message : "Generazione non riuscita.",
        },
      }));
      return false;
    }
  }

  async function generateAll() {
    if (runningRef.current || eligible.length === 0) return;
    runningRef.current = true;
    const queue = [...eligible];
    const ids = queue.map((item) => item.id);
    setRunItemIds(ids);
    setElapsedSeconds(0);
    setLastSummary(null);
    setProgress((current) => ({
      ...current,
      ...Object.fromEntries(ids.map((id) => [id, { status: "queued" as const }])),
    }));
    setRunning(true);

    let cursor = 0;
    let savedCount = 0;
    let failedCount = 0;
    async function worker() {
      while (cursor < queue.length) {
        const item = queue[cursor];
        cursor += 1;
        if (await generateItem(item)) savedCount += 1;
        else failedCount += 1;
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(2, queue.length) }, () => worker()));
      setLastSummary({ saved: savedCount, failed: failedCount });
      router.refresh();
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  const buttonLabel = running
    ? `Generazione in corso · ${completed}/${runItemIds.length}`
    : eligible.length === 0
      ? "Nessuna immagine da generare"
      : lastSummary?.failed
        ? `Riprova ${eligible.length} ${eligible.length === 1 ? "immagine" : "immagini"}`
        : `Genera ${eligible.length} ${eligible.length === 1 ? "immagine mancante" : "immagini mancanti"}`;

  return (
    <section className={`menu-image-generator${running ? " is-running" : ""}`} aria-busy={running}>
      <div className="menu-image-generator-heading">
        <div>
          <p className="eyebrow">Studio immagini AI</p>
          <h2>Completa le foto del catalogo</h2>
          <p>Un solo comando genera esclusivamente i prodotti senza immagine. Ogni risultato resta privato fino alla revisione manuale.</p>
        </div>
        <span className="menu-image-quality">Qualità media · WebP</span>
      </div>

      <div className="menu-image-metrics" aria-label="Stato immagini del menu">
        <article><span>Prodotti</span><strong>{items.length}</strong><small>nel catalogo</small></article>
        <article><span>Presenti</span><strong>{presentCount}</strong><small>già in bozza</small></article>
        <article><span>In revisione</span><strong>{reviewCount}</strong><small>ancora private</small></article>
        <article><span>Da generare</span><strong>{eligible.length}</strong><small>incluse le rifiutate</small></article>
      </div>

      <div className="menu-image-action-row">
        <button
          type="button"
          className="button button-accent menu-image-generate-button"
          onClick={() => void generateAll()}
          disabled={running || eligible.length === 0}
        >
          {running ? <span className="loading-spinner" aria-hidden="true" /> : <span aria-hidden="true">✦</span>}
          {buttonLabel}
        </button>
        <small>La pagina deve restare aperta durante la generazione. Il menu online non cambia.</small>
      </div>

      {(running || lastSummary) ? (
        <div className="menu-image-progress">
          <div className="menu-image-progress-copy">
            <div>
              <strong>{running ? "Sto creando le immagini" : "Sessione completata"}</strong>
              <span>{completed} di {runItemIds.length} elaborate · {saved} in revisione{failed ? ` · ${failed} da riprovare` : ""}</span>
            </div>
            <span>{percent}%</span>
          </div>
          <div
            className="menu-image-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={runItemIds.length}
            aria-valuenow={completed}
            aria-label="Avanzamento generazione immagini"
          ><span style={{ width: `${percent}%` }} /></div>
          <p className="menu-image-live-copy" role="status" aria-live="polite">{statusCopy}</p>

          {visibleActivity.length ? (
            <ul className="menu-image-activity" aria-label="Ultimi prodotti elaborati">
              {visibleActivity.map((id) => {
                const item = itemById.get(id);
                const itemProgress = progress[id];
                if (!item || !itemProgress) return null;
                return (
                  <li className={`is-${itemProgress.status}`} key={id}>
                    {itemProgress.previewUrl ? (
                      // Short-lived signed preview for a private intake object.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={itemProgress.previewUrl} alt="" />
                    ) : <span className="menu-image-activity-icon" aria-hidden="true" />}
                    <div><strong>{item.name}</strong><small>{progressLabel(itemProgress)}</small></div>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {!running && lastSummary?.failed ? (
            <p className="menu-image-retry-note" role="alert">Le immagini riuscite sono già al sicuro. Il pulsante principale riproverà soltanto quelle rimaste.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
