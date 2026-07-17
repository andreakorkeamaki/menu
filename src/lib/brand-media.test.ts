import { describe, expect, it } from "vitest";
import { brandMediaObjectPath, detectBrandImageMime, menuItemMediaObjectPath } from "@/lib/brand-media";

describe("brand media", () => {
  it("sniffs only supported raster image signatures", () => {
    expect(detectBrandImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(detectBrandImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectBrandImageMime(new TextEncoder().encode("RIFF0000WEBP"))).toBe("image/webp");
    expect(detectBrandImageMime(new TextEncoder().encode("<svg></svg>"))).toBeNull();
  });

  it("keeps approved object paths inside the tenant branding prefix", () => {
    expect(brandMediaObjectPath("org-1", "cover", "asset-1", "image/webp"))
      .toBe("org-1/branding/cover/asset-1.webp");
  });

  it("isolates dish media under its tenant and item target", () => {
    expect(menuItemMediaObjectPath("org-1", "item-1", "asset-1", "image/jpeg"))
      .toBe("org-1/menu-items/item-1/asset-1.jpg");
  });
});
