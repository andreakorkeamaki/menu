"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type MenuImageStyleItem = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  replaceAssetId?: string | null;
};

type RunKind = "sample" | "catalog";
type ItemProgress = {
  status: "queued" | "running" | "saved" | "reused" | "failed";
  previewUrl?: string | null;
  error?: string;
};

const STYLE_PRESETS = [
  {
    id: "light-editorial",
    label: "Editoriale chiaro",
    instructions: "Luce diurna morbida e chiara, tavolo in pietra beige neutra, composizione ariosa, ombre delicate e palette naturale coerente tra tutte le immagini.",
  },
  {
    id: "warm-osteria",
    label: "Osteria calda",
    instructions: "Atmosfera autentica da osteria italiana, luce laterale calda ma naturale, tavolo in legno scuro discreto, texture vere e composizione conviviale.",
  },
  {
    id: "dark-minimal",
    label: "Elegante scuro",
    instructions: "Sfondo antracite opaco, luce laterale morbida e controllata, contrasto elegante, styling minimale e colori del prodotto rigorosamente naturali.",
  },
] as const;

export function selectMenuImageStyleSamples(items: MenuImageStyleItem[], limit = 4) {
  const categoryIds = new Set<string>();
  const samples: MenuImageStyleItem[] = [];
  for (const item of items) {
    if (categoryIds.has(item.categoryId)) continue;
    categoryIds.add(item.categoryId);
    samples.push(item);
    if (samples.length === limit) break;
  }
  return samples;
}

export function menuImageStylePayload(input: {
  item: MenuImageStyleItem;
  instructions: string;
  replacementOverride?: string | null;
  generationContext: "style_sample" | "catalog_regeneration";
  batchId: string;
}) {
  return {
    item_id: input.item.id,
    instructions: input.instructions.trim(),
    replace_asset_id: input.replacementOverride ?? input.item.replaceAssetId ?? null,
    generation_context: input.generationContext,
    batch_id: input.batchId,
  };
}

export function menuImageStyleSummary(results: Record<string, ItemProgress>) {
  return Object.values(results).reduce((summary, result) => ({
    completed: summary.completed + (["saved", "reused", "failed"].includes(result.status) ? 1 : 0),
    saved: summary.saved + (result.status === "saved" ? 1 : 0),
    reused: summary.reused + (result.status === "reused" ? 1 : 0),
    failed: summary.failed + (result.status === "failed" ? 1 : 0),
  }), { completed: 0, saved: 0, reused: 0, failed: 0 });
}

export function MenuImageStyleStudio({ items }: { items: MenuImageStyleItem[] }) {
  const router = useRouter();
  const runningRef = useRef(false);
  const replacementOverridesRef = useRef<Record<string, string>>({});
  const [instructions, setInstructions] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runKind, setRunKind] = useState<RunKind | null>(null);
  const [runItemIds, setRunItemIds] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, ItemProgress>>({});
  const [sampleReceipt, setSampleReceipt] = useState<{
    instructions: string;
    successfulIds: string[];
    previews: Record<string, string | null>;
  } | null>(null);
  const samples = useMemo(() => selectMenuImageStyleSamples(items), [items]);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const summary = menuImageStyleSummary(results);
  const percent = runItemIds.length ? Math.round((summary.completed / runItemIds.length) * 100) : 0;

  async function generateItem(item: MenuImageStyleItem, style: string, kind: RunKind, batchId: string) {
    setResults((current) => ({ ...current, [item.id]: { status: "running" } }));
    try {
      const response = await fetch("/api/openai/images/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(menuImageStylePayload({
          item,
          instructions: style,
          replacementOverride: replacementOverridesRef.current[item.id],
          generationContext: kind === "sample" ? "style_sample" : "catalog_regeneration",
          batchId,
        })),
      });
      const payload = await response.json() as {
        asset_id?: string;
        preview_url?: string | null;
        error?: string;
      };
      if (!response.ok || !payload.asset_id) {
        throw new Error(payload.error || "Generazione non riuscita.");
      }
      replacementOverridesRef.current[item.id] = payload.asset_id;
      setResults((current) => ({
        ...current,
        [item.id]: { status: "saved", previewUrl: payload.preview_url ?? null },
      }));
      return { id: item.id, previewUrl: payload.preview_url ?? null };
    } catch (error) {
      setResults((current) => ({
        ...current,
        [item.id]: {
          status: "failed",
          error: error instanceof Error ? error.message : "Generazione non riuscita.",
        },
      }));
      return null;
    }
  }

  async function run(kind: RunKind) {
    if (runningRef.current || !items.length) return;
    const style = instructions.trim();
    const reusableIds = kind === "catalog" && sampleReceipt?.instructions === style
      ? new Set(sampleReceipt.successfulIds)
      : new Set<string>();
    const targetItems = kind === "sample" ? samples : items;
    if (!targetItems.length) return;
    const confirmation = kind === "sample"
      ? `Generare ${targetItems.length} ${targetItems.length === 1 ? "prova privata" : "prove private"}, una per categoria?`
      : `Rigenerare l’intero catalogo (${targetItems.length} prodotti) con queste indicazioni? Le immagini correnti resteranno disponibili fino al successo.`;
    if (!window.confirm(confirmation)) return;

    runningRef.current = true;
    setRunning(true);
    setRunKind(kind);
    setRunItemIds(targetItems.map((item) => item.id));
    const initialResults = Object.fromEntries(targetItems.map((item) => {
      if (reusableIds.has(item.id)) {
        return [item.id, {
          status: "reused" as const,
          previewUrl: sampleReceipt?.previews[item.id] ?? null,
        }];
      }
      return [item.id, { status: "queued" as const }];
    }));
    setResults(initialResults);
    const queue = targetItems.filter((item) => !reusableIds.has(item.id));
    const batchId = crypto.randomUUID();
    const successful: Array<{ id: string; previewUrl: string | null }> = [];
    let cursor = 0;

    async function worker() {
      while (cursor < queue.length) {
        const item = queue[cursor++];
        const result = await generateItem(item, style, kind, batchId);
        if (result) successful.push(result);
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(2, queue.length) }, () => worker()));
      if (kind === "sample") {
        setSampleReceipt({
          instructions: style,
          successfulIds: successful.map((result) => result.id),
          previews: Object.fromEntries(successful.map((result) => [result.id, result.previewUrl])),
        });
      }
      router.refresh();
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  return (
    <section className="menu-image-style-studio" aria-busy={running}>
      <div className="style-studio-heading">
        <div>
          <p className="eyebrow">Studio stile</p>
          <h2>Trova l’atmosfera giusta prima di rifare tutto</h2>
          <p>Genera fino a quattro bozze private, una per categoria. Quando lo stile ti convince, applica le stesse indicazioni all’intero catalogo.</p>
        </div>
        <span className="menu-image-quality">Qualità media · private</span>
      </div>

      <div className="style-studio-workspace">
        <div className="style-studio-controls">
          <fieldset>
            <legend>Parti da uno stile</legend>
            <div className="style-preset-list">
              {STYLE_PRESETS.map((preset) => (
                <button
                  type="button"
                  className={selectedPreset === preset.id ? "is-active" : ""}
                  aria-pressed={selectedPreset === preset.id}
                  onClick={() => {
                    setSelectedPreset(preset.id);
                    setInstructions(preset.instructions);
                  }}
                  disabled={running}
                  key={preset.id}
                >{preset.label}</button>
              ))}
            </div>
          </fieldset>
          <label htmlFor="catalog-style-instructions">
            <strong>Direzione comune per tutte le immagini</strong>
            <textarea
              id="catalog-style-instructions"
              value={instructions}
              maxLength={1_000}
              rows={5}
              onChange={(event) => {
                setSelectedPreset(null);
                setInstructions(event.currentTarget.value);
              }}
              placeholder="Es. sfondo chiaro in pietra, luce laterale morbida, stile editoriale naturale e inquadratura coerente…"
              disabled={running}
            />
            <small>{instructions.length}/1000 · puoi anche provare il prompt v2 senza indicazioni aggiuntive.</small>
          </label>
        </div>

        <aside className="style-sample-plan">
          <p className="eyebrow">Campione automatico</p>
          <h3>{samples.length} {samples.length === 1 ? "categoria" : "categorie"}</h3>
          <ol>
            {samples.map((item) => (
              <li key={item.id}><span>{item.categoryName}</span><strong>{item.name}</strong></li>
            ))}
          </ol>
          <small>Viene scelto il primo prodotto di ogni categoria, fino a un massimo di quattro.</small>
        </aside>
      </div>

      <div className="style-studio-actions">
        <button className="button button-light" type="button" onClick={() => void run("sample")} disabled={running || samples.length === 0}>
          {running && runKind === "sample" ? `Genero le prove · ${summary.completed}/${runItemIds.length}` : `Genera ${samples.length} ${samples.length === 1 ? "prova" : "prove"}`}
        </button>
        <button className="button button-accent" type="button" onClick={() => void run("catalog")} disabled={running || items.length === 0}>
          {running && runKind === "catalog" ? `Rigenerazione · ${summary.completed}/${runItemIds.length}` : `Rigenera tutto il catalogo (${items.length})`}
        </button>
        <small>Le immagini online e le bozze precedenti restano intatte finché ogni nuova versione non è stata generata con successo.</small>
      </div>

      {runItemIds.length ? (
        <div className="style-studio-progress" role="status" aria-live="polite">
          <div className="menu-image-progress-copy">
            <div>
              <strong>{running ? (runKind === "sample" ? "Sto preparando le prove" : "Sto rigenerando il catalogo") : "Sessione completata"}</strong>
              <span>{summary.completed}/{runItemIds.length} completate · {summary.saved} nuove{summary.reused ? ` · ${summary.reused} prove riutilizzate` : ""}{summary.failed ? ` · ${summary.failed} non riuscite` : ""}</span>
            </div>
            <span>{percent}%</span>
          </div>
          <div className="menu-image-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={runItemIds.length} aria-valuenow={summary.completed} aria-label="Avanzamento studio stile"><span style={{ width: `${percent}%` }} /></div>
          <ul className="style-studio-results">
            {runItemIds.map((id) => {
              const item = itemById.get(id);
              const result = results[id];
              if (!item || !result) return null;
              return (
                <li className={`is-${result.status}`} key={id}>
                  {result.previewUrl ? (
                    // Signed preview for a private intake object.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={result.previewUrl} alt="" />
                  ) : <span className="menu-image-activity-icon" aria-hidden="true" />}
                  <div><span>{item.categoryName}</span><strong>{item.name}</strong><small>{result.status === "failed" ? result.error : result.status === "reused" ? "Prova già valida" : result.status === "saved" ? "Bozza privata pronta" : result.status === "running" ? "In generazione" : "In coda"}</small></div>
                </li>
              );
            })}
          </ul>
          {!running && summary.failed ? <p className="menu-image-retry-note">Le immagini riuscite restano valide. Puoi ripetere il comando: ogni prodotto viene gestito separatamente.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
