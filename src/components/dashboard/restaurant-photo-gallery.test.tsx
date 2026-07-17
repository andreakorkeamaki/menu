import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  restaurantPhotoGenerationMode,
  restaurantPhotoStatus,
} from "@/lib/menu-photo-status";

describe("restaurantPhotoStatus", () => {
  it("prioritizes a private review draft without hiding the approved draft image", () => {
    expect(restaurantPhotoStatus({ imageUrl: "https://example.test/approved.webp", approvalStatus: "draft" })).toBe("review");
    expect(restaurantPhotoStatus({ imageUrl: "https://example.test/approved.webp", approvalStatus: "rejected" })).toBe("approved");
  });

  it("groups a rejected result with missing photos", () => {
    expect(restaurantPhotoStatus({ imageUrl: null, approvalStatus: "rejected" })).toBe("rejected");
    expect(restaurantPhotoStatus({ imageUrl: null })).toBe("missing");
  });

  it("allows legacy approved images without a media row to be regenerated", () => {
    expect(restaurantPhotoGenerationMode({
      imageUrl: "https://example.test/legacy.webp",
      hasMediaAsset: false,
    })).toBe("regenerate");
    expect(restaurantPhotoGenerationMode({ imageUrl: null, hasMediaAsset: false })).toBe("generate");
  });

  it("keeps status derivation outside the client component boundary", () => {
    const pageSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/photos/page.tsx"), "utf8");
    const helperSource = readFileSync(resolve(process.cwd(), "src/lib/menu-photo-status.ts"), "utf8");

    expect(pageSource).toContain('import { restaurantPhotoStatus } from "@/lib/menu-photo-status";');
    expect(helperSource).not.toContain('"use client"');
  });
});
