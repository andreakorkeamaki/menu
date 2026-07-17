import type OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMenuImage,
  menuImagePrompt,
  menuImageSourceFromItem,
  menuImageSourceHash,
} from "@/lib/ai/menu-image";

const originalModel = process.env.OPENAI_IMAGE_MODEL;

afterEach(() => {
  if (originalModel === undefined) delete process.env.OPENAI_IMAGE_MODEL;
  else process.env.OPENAI_IMAGE_MODEL = originalModel;
});

const source = menuImageSourceFromItem({
  id: "00000000-0000-4000-8000-000000000041",
  name_it: "Tortelloni burro e salvia",
  description_it: "Pasta fresca ripiena di ricotta",
  ingredients_it: "Pasta fresca, ricotta, burro, salvia",
  vegetarian: true,
  vegan: false,
  gluten_free: false,
}, "Primi");

describe("menu image generation", () => {
  it("builds a stable, restrained prompt from normalized menu data", () => {
    const prompt = menuImagePrompt(source);
    expect(prompt).toContain("Tortelloni burro e salvia");
    expect(prompt).toContain("Pasta fresca, ricotta, burro, salvia");
    expect(prompt).toContain("Do not add visible ingredients");
    expect(prompt).toContain("No collage, no border, no typography");
    expect(menuImageSourceHash({ ...source, description: "Testo nuovo" }))
      .not.toBe(menuImageSourceHash(source));
  });

  it("requests one medium landscape WebP and validates the returned file", async () => {
    delete process.env.OPENAI_IMAGE_MODEL;
    const webp = Buffer.from("RIFF0000WEBPgenerated-image");
    const generate = vi.fn(async () => ({
      data: [{ b64_json: webp.toString("base64") }],
      usage: { total_tokens: 123 },
      _request_id: "req-image-1",
    }));
    const openai = { images: { generate } } as unknown as OpenAI;

    const result = await createMenuImage(source, { openai });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-image-2",
        n: 1,
        size: "1536x1024",
        quality: "medium",
        output_format: "webp",
        output_compression: 82,
        background: "opaque",
      }),
      { timeout: 240_000, maxRetries: 1 },
    );
    expect(result.bytes).toEqual(webp);
    expect(result.requestId).toBe("req-image-1");
  });

  it("rejects provider output that is not a real WebP payload", async () => {
    const generate = vi.fn(async () => ({
      data: [{ b64_json: Buffer.from("not-an-image").toString("base64") }],
      _request_id: "req-image-2",
    }));
    const openai = { images: { generate } } as unknown as OpenAI;
    await expect(createMenuImage(source, { openai })).rejects.toThrow("file immagine non valido");
  });
});
