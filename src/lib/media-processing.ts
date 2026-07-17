import sharp from "sharp";

export type PublicMediaKind = "logo" | "cover" | "menu_item";

const profiles: Record<PublicMediaKind, {
  width: number;
  height: number;
  quality: number;
  minimumShortEdge: number;
}> = {
  logo: { width: 1200, height: 1200, quality: 88, minimumShortEdge: 96 },
  cover: { width: 1920, height: 1280, quality: 84, minimumShortEdge: 480 },
  menu_item: { width: 1200, height: 900, quality: 82, minimumShortEdge: 320 },
};

export class MediaProcessingError extends Error {
  constructor(public readonly reason: "invalid" | "dimensions") {
    super(reason === "dimensions" ? "Image dimensions are too small." : "Image cannot be decoded safely.");
    this.name = "MediaProcessingError";
  }
}

export async function preparePublicMedia(source: Buffer, kind: PublicMediaKind) {
  const profile = profiles[kind];
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(source, {
      failOn: "warning",
      limitInputPixels: 40_000_000,
    }).metadata();
  } catch {
    throw new MediaProcessingError("invalid");
  }

  if (
    !metadata.width
    || !metadata.height
    || (metadata.pages ?? 1) !== 1
    || Math.min(metadata.width, metadata.height) < profile.minimumShortEdge
  ) {
    throw new MediaProcessingError(metadata.width && metadata.height ? "dimensions" : "invalid");
  }

  try {
    const result = await sharp(source, {
      failOn: "warning",
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({
        width: profile.width,
        height: profile.height,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: profile.quality, effort: 4, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });

    return {
      data: result.data,
      mime: "image/webp" as const,
      width: result.info.width,
      height: result.info.height,
      size: result.info.size,
    };
  } catch {
    throw new MediaProcessingError("invalid");
  }
}
