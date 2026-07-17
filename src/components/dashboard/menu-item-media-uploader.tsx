"use client";

import { useEffect, useState } from "react";
import { deleteMenuItemMedia, removeMenuItemImage, uploadMenuItemMedia } from "@/app/dashboard/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";

export interface MenuItemMediaAsset {
  id: string;
  approval_status: "draft" | "approved" | "rejected";
  is_public: boolean;
  previewUrl: string | null;
}

export function MenuItemMediaUploader({
  itemId,
  itemName,
  currentImageUrl,
  latestAsset,
}: {
  itemId: string;
  itemName: string;
  currentImageUrl: string | null;
  latestAsset?: MenuItemMediaAsset;
}) {
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const isPending = latestAsset?.approval_status === "draft";
  const visibleImage = localPreview || (isPending ? latestAsset.previewUrl : null) || currentImageUrl;

  useEffect(() => () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  return (
    <details className="item-media-panel">
      <summary>
        <span>Foto del prodotto</span>
        <small>{isPending ? "In revisione" : currentImageUrl ? "Presente nella bozza" : "Da aggiungere"}</small>
      </summary>
      <div className="item-media-workspace">
        <div className={`item-media-preview${visibleImage ? " has-image" : ""}`}>
          {visibleImage ? (
            // Private previews are signed; approved URLs are public draft data.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={visibleImage} alt={`Anteprima foto di ${itemName}`} />
          ) : <span aria-hidden="true">▧</span>}
        </div>

        {isPending ? (
          <div className="item-media-copy">
            <div><strong>Controllo qualità in corso</strong><p>L’originale resta privato. Dopo l’approvazione vedrai qui la copia ottimizzata; il menu online cambierà soltanto alla prossima pubblicazione.</p></div>
            <form action={deleteMenuItemMedia}>
              <input type="hidden" name="asset_id" value={latestAsset.id} />
              <PendingSubmitButton className="text-button danger-text-button" pendingLabel="Ritiro…">Ritira foto</PendingSubmitButton>
            </form>
          </div>
        ) : (
          <div className="item-media-actions">
            <form action={uploadMenuItemMedia} className="item-media-upload">
              <input type="hidden" name="item_id" value={itemId} />
              <div><strong>{currentImageUrl ? "Sostituisci la foto" : "Aggiungi una foto autentica"}</strong><p>Meglio una foto nitida e non ritoccata in modo eccessivo. Verrà ridimensionata e convertita in WebP prima di diventare pubblicabile.</p></div>
              {latestAsset?.approval_status === "rejected" ? <p className="item-media-rejected" role="status">La foto precedente non è stata approvata. Puoi inviarne una nuova.</p> : null}
              <label className="file-picker">
                <span>{fileName || "Scegli JPG, PNG o WebP"}</span>
                <input
                  name="file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    setLocalPreview((current) => {
                      if (current) URL.revokeObjectURL(current);
                      return file ? URL.createObjectURL(file) : null;
                    });
                    setFileName(file?.name ?? "");
                  }}
                />
              </label>
              <label>Descrizione per la revisione <span className="optional-label">facoltativa</span>
                <input name="alt_text" maxLength={240} defaultValue={itemName} />
              </label>
              <small>Massimo 8 MB · lato corto minimo 320 px · nessuna modifica al menu online prima della pubblicazione.</small>
              <PendingSubmitButton className="button button-light" pendingLabel="Caricamento…">Invia per la revisione</PendingSubmitButton>
            </form>
            {currentImageUrl ? (
              <form action={removeMenuItemImage} className="item-media-remove">
                <input type="hidden" name="item_id" value={itemId} />
                <div><strong>Preferisci un menu solo testo?</strong><p>Rimuovi la foto dalla bozza. La versione già online resterà invariata fino alla prossima pubblicazione.</p></div>
                <PendingSubmitButton className="text-button danger-text-button" pendingLabel="Rimozione…">Rimuovi dalla bozza</PendingSubmitButton>
              </form>
            ) : null}
          </div>
        )}
      </div>
    </details>
  );
}
