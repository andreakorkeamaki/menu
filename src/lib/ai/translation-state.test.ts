import { describe, expect, it } from "vitest";
import { sourceHash } from "@/lib/ai/source-hash";
import {
  applyMachineTranslationDraft,
  approveTranslation,
  markTranslationAfterSourceEdit,
  saveManualTranslation,
  type TranslationState,
} from "@/lib/ai/translation-state";

describe("translation freshness", () => {
  const approvedMachine: TranslationState = {
    translatedText: "Tomato pasta",
    sourceHash: sourceHash("Pasta al pomodoro"),
    status: "approved",
    origin: "machine",
    approvedBy: "user-1",
    approvedAt: "2026-07-15T10:00:00.000Z",
  };

  it("marks an approved translation stale after a source edit", () => {
    expect(
      markTranslationAfterSourceEdit(approvedMachine, "Pasta al pomodoro fresco")
        .status,
    ).toBe("stale");
  });

  it("does not overwrite a manual correction with a machine draft", () => {
    const manual = saveManualTranslation(
      "Fresh tomato pasta",
      "Pasta al pomodoro",
      "editor-1",
      "2026-07-15T11:00:00.000Z",
    );
    const result = applyMachineTranslationDraft(
      manual,
      "Pasta with tomato",
      "Pasta al pomodoro",
    );
    expect(result.manualCorrectionProtected).toBe(true);
    expect(result.translation).toBe(manual);
  });

  it("refreshes the source hash only when a translation is reviewed", () => {
    const stale = markTranslationAfterSourceEdit(
      approvedMachine,
      "Pasta al pomodoro fresco",
    );
    expect(stale.sourceHash).toBe(sourceHash("Pasta al pomodoro"));
    expect(
      approveTranslation(
        stale,
        "Pasta al pomodoro fresco",
        "editor-1",
        "2026-07-15T12:00:00.000Z",
      ).sourceHash,
    ).toBe(sourceHash("Pasta al pomodoro fresco"));
  });
});
