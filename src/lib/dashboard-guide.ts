export type DashboardGuideStep = {
  id: "site" | "menu" | "translations" | "publication";
  label: string;
  href: string;
  complete: boolean;
};

const BLOCKER_STEP: Record<string, DashboardGuideStep["id"]> = {
  location: "site",
  categories: "menu",
  items: "menu",
  availability: "menu",
  translations: "translations",
};

export function buildDashboardGuide({ blockerCodes, published }: { blockerCodes: string[]; published: boolean }) {
  const blockedSteps = new Set(blockerCodes.map((code) => BLOCKER_STEP[code]).filter(Boolean));
  const steps: DashboardGuideStep[] = [
    { id: "site", label: "Sito e identità", href: "/dashboard/site", complete: !blockedSteps.has("site") },
    { id: "menu", label: "Menu e disponibilità", href: "/dashboard/menu", complete: !blockedSteps.has("menu") },
    { id: "translations", label: "Traduzioni", href: "/dashboard/translations", complete: !blockedSteps.has("translations") },
    { id: "publication", label: published ? "Versione online" : "Revisione finale", href: "/dashboard/menu/review", complete: published },
  ];
  const next = steps.find((step) => !step.complete) ?? steps[3];
  const completed = steps.filter((step) => step.complete).length;
  const actionLabel = next.id === "site"
    ? "Completa il sito"
    : next.id === "menu"
      ? "Completa il menu"
      : next.id === "translations"
        ? "Rivedi le traduzioni"
        : published
          ? "Controlla la prossima versione"
          : "Rivedi e pubblica";
  return {
    steps,
    next,
    actionLabel,
    percent: completed * 25,
    complete: completed === steps.length,
  };
}
