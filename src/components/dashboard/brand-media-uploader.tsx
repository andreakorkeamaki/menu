"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { uploadBrandMedia } from "@/app/dashboard/actions";
import type { BrandMediaKind } from "@/lib/brand-media";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button button-dark" disabled={pending}>
      {pending ? "Caricamento…" : "Invia per la revisione"}
    </button>
  );
}

export function BrandMediaUploader({
  kind,
  locationId,
  label,
  description,
}: {
  kind: BrandMediaKind;
  locationId: string;
  label: string;
  description: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <form action={uploadBrandMedia} className="brand-upload-card">
      <input type="hidden" name="location_id" value={locationId} />
      <input type="hidden" name="media_kind" value={kind} />
      <div className={`brand-upload-preview brand-upload-${kind}`}>
        {preview ? (
          // A local object URL is shown only before the authenticated upload.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={`Anteprima ${label.toLocaleLowerCase("it-IT")}`} />
        ) : (
          <span aria-hidden="true">{kind === "logo" ? "L" : "▧"}</span>
        )}
      </div>
      <div className="brand-upload-copy">
        <div><p className="eyebrow">{kind === "logo" ? "Identità" : "Atmosfera"}</p><h3>{label}</h3></div>
        <p>{description}</p>
        <label className="file-picker">
          <span>{fileName || "Scegli JPG, PNG o WebP"}</span>
          <input
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              setPreview((current) => {
                if (current) URL.revokeObjectURL(current);
                return file ? URL.createObjectURL(file) : null;
              });
              setFileName(file?.name ?? "");
            }}
          />
        </label>
        <label>Testo descrittivo <span className="optional-label">facoltativo</span>
          <input name="alt_text" maxLength={240} placeholder={kind === "logo" ? "Logo del ristorante" : "Sala e atmosfera del ristorante"} />
        </label>
        <small>Massimo 8 MB. Il file resta privato finché un operatore non lo approva.</small>
        <SubmitButton />
      </div>
    </form>
  );
}
