"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type MenuImageStyleItem = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  replaceAssetId?: string | null;
};

type RunKind = "sample" | "catalog";
export type MenuImageSampleQuality = "medium" | "high";
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
  quality: MenuImageSampleQuality;
  useLogo: boolean;
}) {
  return {
    item_id: input.item.id,
    instructions: input.instructions.trim(),
    replace_asset_id: input.replacementOverride ?? input.item.replaceAssetId ?? null,
    generation_context: input.generationContext,
    batch_id: input.batchId,
    ...(input.generationContext === "style_sample" ? {
      quality: input.quality,
      use_logo: input.useLogo,
    } : {}),
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

export function MenuImageStyleStudio({ items, logoUrl = null }: { items: MenuImageStyleItem[]; logoUrl?: string | null }) {
  const router = useRouter();
  const runningRef = useRef(false);
  const replacementOverridesRef = useRef<Record<string, string>>({});
  const [instructions, setInstructions] = useState("");
  const [sampleQuality, setSampleQuality] = useState<MenuImageSampleQuality>("medium");
  const [useLogo, setUseLogo] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runKind, setRunKind] = useState<RunKind | null>(null);
  const [runOptions, setRunOptions] = useState<{
    quality: MenuImageSampleQuality;
    useLogo: boolean;
  } | null>(null);
  const [runItemIds, setRunItemIds] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, ItemProgress>>({});
  const [sampleReceipt, setSampleReceipt] = useState<{
    instructions: string;
    quality: MenuImageSampleQuality;
    useLogo: boolean;
    successfulIds: string[];
    previews: Record<string, string | null>;
  } | null>(null);
  const samples = useMemo(() => selectMenuImageStyleSamples(items), [items]);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const summary = menuImageStyleSummary(results);
  const percent = runItemIds.length ? Math.round((summary.completed / runItemIds.length) * 100) : 0;

  async function generateItem(
    item: MenuImageStyleItem,
    style: string,
    kind: RunKind,
    batchId: string,
    sampleOptions: { quality: MenuImageSampleQuality; useLogo: boolean },
  ) {
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
          quality: sampleOptions.quality,
          useLogo: sampleOptions.useLogo,
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
    const selectedSampleOptions = {
      quality: sampleQuality,
      useLogo: useLogo && Boolean(logoUrl),
    };
    const reusableIds = kind === "catalog"
      && sampleReceipt?.instructions === style
      && sampleReceipt.quality === "medium"
      && !sampleReceipt.useLogo
      ? new Set(sampleReceipt.successfulIds)
      : new Set<string>();
    const targetItems = kind === "sample" ? samples : items;
    if (!targetItems.length) return;
    const confirmation = kind === "sample"
      ? `Generare ${targetItems.length} ${targetItems.length === 1 ? "prova privata" : "prove private"} in qualità ${selectedSampleOptions.quality === "high" ? "alta" : "media"}${selectedSampleOptions.useLogo ? ", usando il logo approvato" : ""}?`
      : `Rigenerare l’intero catalogo (${targetItems.length} prodotti) con queste indicazioni? Le immagini correnti resteranno disponibili fino al successo.`;
    if (!window.confirm(confirmation)) return;

    runningRef.current = true;
    setRunning(true);
    setRunKind(kind);
    setRunOptions(kind === "sample" ? selectedSampleOptions : { quality: "medium", useLogo: false });
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
        const result = await generateItem(item, style, kind, batchId, selectedSampleOptions);
        if (result) successful.push(result);
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(2, queue.length) }, () => worker()));
      if (kind === "sample") {
        setSampleReceipt({
          instructions: style,
          quality: selectedSampleOptions.quality,
          useLogo: selectedSampleOptions.useLogo,
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
        <span className="menu-image-quality">Prove: qualità {sampleQuality === "high" ? "alta" : "media"} · 1536×1024</span>
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
            <small>{instructions.length}/1000 · puoi anche provare il prompt v3 senza indicazioni aggiuntive.</small>
          </label>
          <fieldset className="style-sample-options">
            <legend>Opzioni delle quattro prove</legend>
            <p>La dimensione resta 1536×1024: cambia la qualità di rendering. Queste scelte non modificano la rigenerazione completa.</p>
            <div className="style-quality-options">
              {([
                ["medium", "Media", "Più rapida, ideale per confrontare lo stile."],
                ["high", "Alta", "Più dettaglio e costo maggiore, stessa dimensione."],
              ] as const).map(([value, label, detail]) => (
                <label className={sampleQuality === value ? "is-active" : ""} key={value}>
                  <input
                    type="radio"
                    name="sample-quality"
                    value={value}
                    checked={sampleQuality === value}
                    onChange={() => setSampleQuality(value)}
                    disabled={running}
                  />
                  <span><strong>{label}</strong><small>{detail}</small></span>
                </label>
              ))}
            </div>
            <div className={`style-logo-option${logoUrl ? "" : " is-unavailable"}`}>
              <div className="style-logo-preview">
                {logoUrl ? (
                  // Active restaurant logo is approved public media.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" />
                ) : <span aria-hidden="true">L</span>}
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={useLogo}
                  onChange={(event) => setUseLogo(event.currentTarget.checked)}
                  disabled={running || !logoUrl}
                />
                <span><strong>Inserisci il logo nelle prove</strong><small>Lo useremo come riferimento approvato e come dettaglio discreto nella scena.</small></span>
              </label>
              {!logoUrl ? <Link href="/dashboard/site">Carica e fai approvare il logo →</Link> : null}
            </div>
          </fieldset>
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
        <small>Qualità e logo valgono soltanto per le prove. Il catalogo completo resta in qualità media e senza logo finché non deciderai diversamente.</small>
      </div>

      {runItemIds.length ? (
        <div className="style-studio-progress" role="status" aria-live="polite">
          <div className="menu-image-progress-copy">
            <div>
              <strong>{running ? (runKind === "sample" ? "Sto preparando le prove" : "Sto rigenerando il catalogo") : "Sessione completata"}</strong>
              <span>{summary.completed}/{runItemIds.length} completate · {summary.saved} nuove{runKind === "sample" && runOptions ? ` · qualità ${runOptions.quality === "high" ? "alta" : "media"}${runOptions.useLogo ? " · con logo" : ""}` : ""}{summary.reused ? ` · ${summary.reused} prove riutilizzate` : ""}{summary.failed ? ` · ${summary.failed} non riuscite` : ""}</span>
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
