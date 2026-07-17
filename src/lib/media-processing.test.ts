import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MediaProcessingError, preparePublicMedia } from "@/lib/media-processing";

describe("public media processing", () => {
  it("turns a large dish original into a bounded WebP derivative", async () => {
    const source = await sharp({
      create: {
        width: 2400,
        height: 1600,
        channels: 3,
        background: { r: 142, g: 64, b: 42 },
      },
    }).jpeg({ quality: 95 }).toBuffer();

    const output = await preparePublicMedia(source, "menu_item");

    expect(output.mime).toBe("image/webp");
    expect(output.width).toBeLessThanOrEqual(1200);
    expect(output.height).toBeLessThanOrEqual(900);
    expect(output.size).toBeLessThan(source.length);
    expect((await sharp(output.data).metadata()).format).toBe("webp");
  });

  it("rejects images that cannot stay crisp in a menu card", async () => {
    const source = await sharp({
      create: {
        width: 200,
        height: 120,
        channels: 3,
        background: { r: 142, g: 64, b: 42 },
      },
    }).png().toBuffer();

    await expect(preparePublicMedia(source, "menu_item"))
      .rejects.toEqual(expect.objectContaining<Partial<MediaProcessingError>>({ reason: "dimensions" }));
  });
});
