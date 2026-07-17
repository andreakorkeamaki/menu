export type PublicationReadinessItem = {
  available: boolean;
  description: string | null;
  ingredients: string | null;
  allergenCount: number;
};

export type ReadinessIssue = {
  severity: "blocker" | "warning";
  code: string;
  title: string;
  detail: string;
};

export function buildPublicationReadiness({
  categoryCount,
  items,
  pendingTranslations,
  locationConfigured,
}: {
  categoryCount: number;
  items: PublicationReadinessItem[];
  pendingTranslations: number;
  locationConfigured: boolean;
}) {
  const issues: ReadinessIssue[] = [];
  const availableItems = items.filter((item) => item.available);
  const foodInfoToVerify = availableItems.filter((item) => !item.ingredients && item.allergenCount === 0).length;
  const missingDescriptions = availableItems.filter((item) => !item.description).length;

  if (!locationConfigured) {
    issues.push({ severity: "blocker", code: "location", title: "Completa il sito del ristorante", detail: "Nome, sede e slug pubblico devono essere configurati prima della pubblicazione." });
  }
  if (categoryCount === 0) {
    issues.push({ severity: "blocker", code: "categories", title: "Aggiungi almeno una categoria", detail: "Il menu pubblico ha bisogno di una struttura leggibile." });
  }
  if (items.length === 0) {
    issues.push({ severity: "blocker", code: "items", title: "Aggiungi almeno un piatto", detail: "Non è possibile pubblicare un menu vuoto." });
  } else if (availableItems.length === 0) {
    issues.push({ severity: "blocker", code: "availability", title: "Rendi disponibile almeno un piatto", detail: "Tutti i piatti risultano non disponibili." });
  }
  if (pendingTranslations > 0) {
    issues.push({ severity: "blocker", code: "translations", title: `${pendingTranslations} traduzioni richiedono attenzione`, detail: "Genera o approva le righe obsolete prima di sostituire la versione online." });
  }
  if (foodInfoToVerify > 0) {
    issues.push({ severity: "warning", code: "food-info", title: `Verifica le informazioni alimentari di ${foodInfoToVerify} piatti`, detail: "Non risultano ingredienti né allergeni dichiarati. Conferma che l’assenza sia intenzionale." });
  }
  if (missingDescriptions > 0) {
    issues.push({ severity: "warning", code: "descriptions", title: `${missingDescriptions} piatti non hanno una descrizione`, detail: "Puoi pubblicare comunque, ma una breve descrizione rende il menu più chiaro e traducibile." });
  }

  const blockers = issues.filter((issue) => issue.severity === "blocker");
  return {
    canPublish: blockers.length === 0,
    blockers,
    warnings: issues.filter((issue) => issue.severity === "warning"),
    availableItemCount: availableItems.length,
    foodInfoToVerify,
  };
}
