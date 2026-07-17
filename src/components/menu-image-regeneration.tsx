"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function menuImageRegenerationPayload(input: {
  itemId: string;
  instructions: string;
  replaceAssetId?: string | null;
  organizationId?: string;
  menuId?: string;
}) {
  return {
    item_id: input.itemId,
    instructions: input.instructions.trim(),
    replace_asset_id: input.replaceAssetId ?? null,
    ...(input.organizationId ? { organization_id: input.organizationId } : {}),
    ...(input.menuId ? { menu_id: input.menuId } : {}),
  };
}

export function MenuImageRegeneration({
  itemId,
  itemName,
  replaceAssetId,
  organizationId,
  menuId,
  mode = "regenerate",
}: {
  itemId: string;
  itemName: string;
  replaceAssetId?: string | null;
  organizationId?: string;
  menuId?: string;
  mode?: "generate" | "regenerate";
}) {
  const router = useRouter();
  const [instructions, setInstructions] = useState("");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running) return;
    setRunning(true);
    setMessage(null);
    try {
      const response = await fetch("/api/openai/images/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(menuImageRegenerationPayload({
          itemId,
          instructions,
          replaceAssetId,
          organizationId,
          menuId,
        })),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Generazione non riuscita.");
      setInstructions("");
      setMessage({
        type: "success",
        text: mode === "regenerate"
          ? "Nuova versione salvata in revisione. La bozza precedente è stata conservata fino al completamento."
          : "Immagine salvata nello spazio privato e inviata in revisione.",
      });
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Generazione non riuscita.",
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <form className="menu-image-regeneration" onSubmit={(event) => void submit(event)} aria-busy={running}>
      <label htmlFor={`image-instructions-${itemId}-${replaceAssetId ?? "new"}`}>
        Indicazioni per la nuova versione <span className="optional-label">facoltative</span>
      </label>
      <textarea
        id={`image-instructions-${itemId}-${replaceAssetId ?? "new"}`}
        value={instructions}
        maxLength={1_000}
        rows={3}
        onChange={(event) => setInstructions(event.currentTarget.value)}
        placeholder="Es. usa una coppetta coupe, mostra un assortimento più ricco, luce più naturale…"
      />
      <button className="button button-light" type="submit" disabled={running}>
        {running
          ? "Generazione in corso…"
          : mode === "regenerate"
            ? "Rigenera con queste indicazioni"
            : `Genera la foto di ${itemName}`}
      </button>
      <small>Puoi procedere anche senza una nota. Il risultato resta privato fino al controllo operatore.</small>
      {message ? <p className={message.type === "success" ? "form-success" : "form-error"} role={message.type === "success" ? "status" : "alert"}>{message.text}</p> : null}
    </form>
  );
}
