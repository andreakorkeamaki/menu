import { sourceHash } from "@/lib/ai/source-hash";

export type TranslationStateStatus =
  | "missing"
  | "machine_draft"
  | "approved"
  | "stale"
  | "error";
export type TranslationStateOrigin = "machine" | "manual";

export interface TranslationState {
  translatedText: string | null;
  sourceHash: string;
  status: TranslationStateStatus;
  origin: TranslationStateOrigin;
  approvedBy: string | null;
  approvedAt: string | null;
}

export function markTranslationAfterSourceEdit(
  translation: TranslationState,
  currentSourceText: string,
): TranslationState {
  if (translation.sourceHash === sourceHash(currentSourceText)) return translation;
  if (!translation.translatedText) return { ...translation, status: "missing" };
  return { ...translation, status: "stale" };
}

export function applyMachineTranslationDraft(
  translation: TranslationState | null,
  translatedText: string,
  currentSourceText: string,
): { translation: TranslationState; manualCorrectionProtected: boolean } {
  if (translation?.origin === "manual" && translation.translatedText) {
    return { translation, manualCorrectionProtected: true };
  }

  return {
    translation: {
      translatedText,
      sourceHash: sourceHash(currentSourceText),
      status: "machine_draft",
      origin: "machine",
      approvedBy: null,
      approvedAt: null,
    },
    manualCorrectionProtected: false,
  };
}

export function saveManualTranslation(
  translatedText: string,
  currentSourceText: string,
  actorId: string,
  approvedAt = new Date().toISOString(),
): TranslationState {
  return {
    translatedText,
    sourceHash: sourceHash(currentSourceText),
    status: "approved",
    origin: "manual",
    approvedBy: actorId,
    approvedAt,
  };
}

export function approveTranslation(
  translation: TranslationState,
  currentSourceText: string,
  actorId: string,
  approvedAt = new Date().toISOString(),
): TranslationState {
  if (!translation.translatedText?.trim()) {
    throw new Error("Non è possibile approvare una traduzione vuota.");
  }

  return {
    ...translation,
    sourceHash: sourceHash(currentSourceText),
    status: "approved",
    approvedBy: actorId,
    approvedAt,
  };
}
