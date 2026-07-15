"use client";

import { useMemo, useState } from "react";
import { saveMenuImportStaging } from "@/app/ops/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import type { MenuImportStaging } from "@/lib/ai/schemas";
import {
  getStagingReviewSummary,
  prepareReviewedStagingForSave,
} from "@/lib/import/staging-review";

interface StagingDecisionEditorProps {
  staging: MenuImportStaging;
  stagingId: string;
  organizationId: string;
  caseId: string;
}

function cloneStaging(staging: MenuImportStaging) {
  return structuredClone(staging);
}

export function StagingDecisionEditor({
  staging: initialStaging,
  stagingId,
  organizationId,
  caseId,
}: StagingDecisionEditorProps) {
  const [staging, setStaging] = useState(initialStaging);
  const summary = useMemo(() => getStagingReviewSummary(staging), [staging]);
  const suggestions = staging.categories.flatMap((category, categoryIndex) =>
    category.items.flatMap((item, itemIndex) => [
      ...item.allergens
        .map((allergen, allergenIndex) => ({
          allergen,
          categoryIndex,
          itemIndex,
          variantIndex: null as number | null,
          allergenIndex,
          itemName: item.name,
          variantName: null as string | null,
        }))
        .filter(({ allergen }) => allergen.origin === "ai_inferred"),
      ...item.variants.flatMap((variant, variantIndex) =>
        variant.allergens
          .map((allergen, allergenIndex) => ({
            allergen,
            categoryIndex,
            itemIndex,
            variantIndex,
            allergenIndex,
            itemName: item.name,
            variantName: variant.name,
          }))
          .filter(({ allergen }) => allergen.origin === "ai_inferred"),
      ),
    ]),
  );
  const missingPrices = staging.categories.flatMap((category, categoryIndex) =>
    category.items.flatMap((item, itemIndex) => item.price === null
      ? [{ categoryIndex, itemIndex, itemName: item.name }]
      : []),
  );
  const missingDeltas = staging.categories.flatMap((category, categoryIndex) =>
    category.items.flatMap((item, itemIndex) => item.variants.flatMap((variant, variantIndex) =>
      variant.price_delta === null
        ? [{ categoryIndex, itemIndex, variantIndex, itemName: item.name, variantName: variant.name }]
        : [])),
  );

  function decideAllergen(
    categoryIndex: number,
    itemIndex: number,
    variantIndex: number | null,
    allergenIndex: number,
    confirmed: boolean,
  ) {
    setStaging((current) => {
      const next = cloneStaging(current);
      const item = next.categories[categoryIndex].items[itemIndex];
      const allergens = variantIndex === null
        ? item.allergens
        : item.variants[variantIndex].allergens;
      allergens[allergenIndex].confirmed = confirmed;
      return next;
    });
  }

  function setItemPrice(categoryIndex: number, itemIndex: number, value: string) {
    setStaging((current) => {
      const next = cloneStaging(current);
      next.categories[categoryIndex].items[itemIndex].price = value === "" ? null : Number(value);
      return next;
    });
  }

  function setVariantDelta(
    categoryIndex: number,
    itemIndex: number,
    variantIndex: number,
    value: string | number,
  ) {
    setStaging((current) => {
      const next = cloneStaging(current);
      next.categories[categoryIndex].items[itemIndex].variants[variantIndex].price_delta =
        value === "" ? null : Number(value);
      return next;
    });
  }

  const hasGuidedDecisions = suggestions.length > 0 || missingPrices.length > 0 || missingDeltas.length > 0;
  if (!hasGuidedDecisions) return null;

  return (
    <form action={saveMenuImportStaging} className="staging-decision-editor">
      <input type="hidden" name="staging_id" value={stagingId} />
      <input type="hidden" name="organization_id" value={organizationId} />
      <input type="hidden" name="case_id" value={caseId} />
      <textarea hidden readOnly name="payload" value={JSON.stringify(prepareReviewedStagingForSave(staging))} />

      <header>
        <div>
          <p className="eyebrow">Decisioni richieste</p>
          <h3>{summary.requiredDecisions === 0 ? "Tutto verificato" : `${summary.requiredDecisions} da completare`}</h3>
        </div>
        <p>Confronta solo queste voci con il documento. Il resto può essere importato così com’è.</p>
      </header>

      {suggestions.length > 0 && (
        <section className="decision-section">
          <h4>Allergeni suggeriti dall’AI</h4>
          <p className="form-note">Sono ipotesi basate sul nome o sugli ingredienti: diventano allergeni del menu soltanto dopo il tuo Sì.</p>
          <div className="decision-list">
            {suggestions.map(({ allergen, categoryIndex, itemIndex, variantIndex, allergenIndex, itemName, variantName }) => (
              <article key={`${categoryIndex}-${itemIndex}-${variantIndex ?? "item"}-${allergen.code}-${allergenIndex}`}>
                <div>
                  <strong>{itemName}{variantName ? ` · ${variantName}` : ""}</strong>
                  <span>{allergen.name}</span>
                  <small>{allergen.evidence ?? "Deducibile dal nome o dagli ingredienti; confronta la fonte."}</small>
                </div>
                <div className="yes-no-control" aria-label={`Conferma ${allergen.name} per ${itemName}`}>
                  <button
                    type="button"
                    className={allergen.confirmed === true ? "selected yes" : ""}
                    onClick={() => decideAllergen(categoryIndex, itemIndex, variantIndex, allergenIndex, true)}
                  >Sì</button>
                  <button
                    type="button"
                    className={allergen.confirmed === false ? "selected no" : ""}
                    onClick={() => decideAllergen(categoryIndex, itemIndex, variantIndex, allergenIndex, false)}
                  >No</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {missingPrices.length > 0 && (
        <section className="decision-section">
          <h4>Prezzi mancanti</h4>
          <div className="decision-list">
            {missingPrices.map(({ categoryIndex, itemIndex, itemName }) => (
              <article key={`${categoryIndex}-${itemIndex}-price`}>
                <div><strong>{itemName}</strong><small>Inserisci il prezzo mostrato nella fonte.</small></div>
                <label className="compact-number">€<input type="number" min="0" step="0.01" required onChange={(event) => setItemPrice(categoryIndex, itemIndex, event.target.value)} /></label>
              </article>
            ))}
          </div>
        </section>
      )}

      {missingDeltas.length > 0 && (
        <section className="decision-section">
          <h4>Varianti senza supplemento definito</h4>
          <div className="decision-list">
            {missingDeltas.map(({ categoryIndex, itemIndex, variantIndex, itemName, variantName }) => (
              <article key={`${categoryIndex}-${itemIndex}-${variantIndex}-delta`}>
                <div><strong>{itemName} · {variantName}</strong><small>Se costa uguale, scegli “Nessun supplemento”.</small></div>
                <div className="delta-control">
                  <button type="button" onClick={() => setVariantDelta(categoryIndex, itemIndex, variantIndex, 0)}>Nessun supplemento</button>
                  <label className="compact-number">+ €<input type="number" step="0.01" onChange={(event) => setVariantDelta(categoryIndex, itemIndex, variantIndex, event.target.value)} /></label>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <footer>
        <span>{summary.requiredDecisions === 0 ? "Pronto: salva e poi approva la bozza." : "Completa le scelte evidenziate, poi salva."}</span>
        <PendingSubmitButton className="button button-dark" pendingLabel="Salvataggio decisioni…" disabled={summary.requiredDecisions > 0}>Salva decisioni</PendingSubmitButton>
      </footer>
    </form>
  );
}
