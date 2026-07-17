"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { saveTheme } from "@/app/dashboard/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { assessAccentPalette, formatContrast } from "@/lib/color-contrast";

interface EditableTheme {
  id: string;
  theme_key: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
}

export function AccessibleThemeEditor({ theme }: { theme: EditableTheme }) {
  const [themeKey, setThemeKey] = useState(theme.theme_key === "minimal" ? "minimal" : "editorial");
  const [accent, setAccent] = useState(theme.accent);
  const assessment = useMemo(() => assessAccentPalette({
    accent,
    background: theme.background,
    surface: theme.surface,
  }), [accent, theme.background, theme.surface]);
  const previewStyle = {
    "--theme-preview-accent": accent,
    "--theme-preview-accent-text": assessment.accentText,
    "--theme-preview-background": theme.background,
    "--theme-preview-surface": theme.surface,
    "--theme-preview-text": theme.text,
  } as CSSProperties;

  return (
    <form action={saveTheme} className="dashboard-panel stack-form accessible-theme-editor">
      <input type="hidden" name="id" value={theme.id} />
      <div className="panel-heading"><div><p className="eyebrow">Tema</p><h2>Direzione visiva</h2></div><span className={`contrast-state ${assessment.safe ? "is-safe" : "is-unsafe"}`}>{assessment.safe ? "AA leggibile" : "Contrasto basso"}</span></div>
      <fieldset className="theme-style-options">
        <legend>Stile</legend>
        <label className={themeKey === "editorial" ? "is-selected" : ""}><input type="radio" name="theme_key" value="editorial" checked={themeKey === "editorial"} onChange={() => setThemeKey("editorial")} /><span><strong>Trattoria editoriale</strong><small>Caldo, narrativo, materico</small></span></label>
        <label className={themeKey === "minimal" ? "is-selected" : ""}><input type="radio" name="theme_key" value="minimal" checked={themeKey === "minimal"} onChange={() => setThemeKey("minimal")} /><span><strong>Contemporaneo minimale</strong><small>Pulito, essenziale, urbano</small></span></label>
      </fieldset>
      <label className="accent-color-field"><span>Colore accento</span><div><input name="accent" type="color" value={accent} onChange={(event) => setAccent(event.target.value)} /><code>{accent.toUpperCase()}</code></div></label>
      <section className={`theme-live-preview theme-preview-${themeKey}`} style={previewStyle} aria-label="Anteprima tema">
        <div><small>Menu degustazione</small><strong>Una cucina che parla del territorio.</strong><p>Ingredienti stagionali, gesti contemporanei.</p></div>
        <div><span>Scopri il menu</span><button type="button">Prenota</button></div>
      </section>
      <div className={`contrast-report ${assessment.safe ? "is-safe" : "is-unsafe"}`} role="status" aria-live="polite">
        <div><span>Link su sfondo</span><strong>{formatContrast(assessment.backgroundRatio)}</strong></div>
        <div><span>Link su superficie</span><strong>{formatContrast(assessment.surfaceRatio)}</strong></div>
        <div><span>Testo su pulsante</span><strong>{formatContrast(assessment.accentTextRatio)}</strong></div>
        <p>{assessment.safe ? "Contrasto verificato per testi normali secondo la soglia WCAG AA 4,5:1." : "Scegli un colore più scuro o più saturo: almeno un testo non raggiunge 4,5:1."}</p>
      </div>
      <PendingSubmitButton className="button button-light" pendingLabel="Salvataggio tema…" disabled={!assessment.safe}>Salva tema accessibile</PendingSubmitButton>
    </form>
  );
}
