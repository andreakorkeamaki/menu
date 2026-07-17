export const BRAND_MEDIA_KINDS = ["logo", "cover"] as const;
export type BrandMediaKind = (typeof BRAND_MEDIA_KINDS)[number];

export const BRAND_MEDIA_MAX_BYTES = 8 * 1024 * 1024;
export const MENU_ITEM_MEDIA_MAX_BYTES = 8 * 1024 * 1024;

export const BRAND_MEDIA_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type BrandMediaMime = keyof typeof BRAND_MEDIA_MIME;

export function detectBrandImageMime(bytes: Uint8Array): BrandMediaMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function brandMediaObjectPath(
  organizationId: string,
  kind: BrandMediaKind,
  objectId: string,
  mime: BrandMediaMime,
) {
  return `${organizationId}/branding/${kind}/${objectId}.${BRAND_MEDIA_MIME[mime]}`;
}

export function menuItemMediaObjectPath(
  organizationId: string,
  menuItemId: string,
  objectId: string,
  mime: BrandMediaMime,
) {
  return `${organizationId}/menu-items/${menuItemId}/${objectId}.${BRAND_MEDIA_MIME[mime]}`;
}
