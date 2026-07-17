"use client";

import { useMemo, useState } from "react";
import { MenuImageRegeneration } from "@/components/menu-image-regeneration";
import { MenuItemMediaUploader, type MenuItemMediaAsset } from "@/components/dashboard/menu-item-media-uploader";
import {
  restaurantPhotoGenerationMode,
  type RestaurantPhotoFilter,
  type RestaurantPhotoStatus,
} from "@/lib/menu-photo-status";

export type RestaurantPhotoItem = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  ingredients: string | null;
  imageUrl: string | null;
  status: RestaurantPhotoStatus;
  mediaAsset?: MenuItemMediaAsset & { aiJobId?: string | null; visualInstructions?: string | null };
};

const statusCopy: Record<RestaurantPhotoStatus, string> = {
  approved: "Approvata",
  review: "In revisione",
  missing: "Mancante",
  rejected: "Da sostituire",
};

export function RestaurantPhotoGallery({ items, initialFilter = "all" }: { items: RestaurantPhotoItem[]; initialFilter?: RestaurantPhotoFilter }) {
  const [filter, setFilter] = useState<RestaurantPhotoFilter>(initialFilter);
  const visible = useMemo(() => items.filter((item) => (
    filter === "all"
    || item.status === filter
    || (filter === "missing" && item.status === "rejected")
  )), [filter, items]);

  return (
    <section className="restaurant-photo-gallery">
      <div className="photo-filter-bar" aria-label="Filtra foto per stato">
        {([
          ["all", "Tutte"],
          ["approved", "Approvate"],
          ["review", "In revisione"],
          ["missing", "Mancanti o rifiutate"],
        ] as const).map(([value, label]) => (
          <button type="button" className={filter === value ? "is-active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)} key={value}>
            {label}
            <span>{items.filter((item) => value === "all" || item.status === value || (value === "missing" && item.status === "rejected")).length}</span>
          </button>
        ))}
      </div>

      {visible.length ? (
        <div className="restaurant-photo-grid">
          {visible.map((item) => {
            const visibleImage = item.status === "review"
              ? item.mediaAsset?.previewUrl
              : item.imageUrl;
            return (
              <article className={`restaurant-photo-card is-${item.status}`} key={item.id}>
                <div className="restaurant-photo-preview">
                  {visibleImage ? (
                    // Private review previews use short-lived signed URLs.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={visibleImage} alt={`Foto di ${item.name}`} />
                  ) : <span aria-hidden="true">▧</span>}
                  <strong>{statusCopy[item.status]}</strong>
                </div>
                <div className="restaurant-photo-body">
                  <div><p className="eyebrow">{item.category}</p><h3>{item.name}</h3></div>
                  <p>{item.description || "Nessuna descrizione disponibile."}</p>
                  {item.ingredients ? <small><strong>Ingredienti:</strong> {item.ingredients}</small> : null}
                  {item.mediaAsset?.visualInstructions ? <p className="photo-visual-note"><strong>Ultime indicazioni:</strong> {item.mediaAsset.visualInstructions}</p> : null}
                  <MenuImageRegeneration
                    itemId={item.id}
                    itemName={item.name}
                    replaceAssetId={item.mediaAsset?.id}
                    mode={restaurantPhotoGenerationMode({
                      imageUrl: item.imageUrl,
                      hasMediaAsset: Boolean(item.mediaAsset),
                    })}
                  />
                  <MenuItemMediaUploader
                    itemId={item.id}
                    itemName={item.name}
                    currentImageUrl={item.imageUrl}
                    latestAsset={item.mediaAsset}
                  />
                </div>
              </article>
            );
          })}
        </div>
      ) : <div className="empty-state"><h3>Nessuna foto in questo filtro</h3><p>Scegli un altro stato per vedere il resto del catalogo.</p></div>}
    </section>
  );
}
