import type OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMenuImage,
  menuImagePresentation,
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
  it("builds a stable, photorealistic prompt from normalized menu data", () => {
    const prompt = menuImagePrompt(source);
    expect(prompt).toContain("Tortelloni burro e salvia");
    expect(prompt).toContain("Pasta fresca, ricotta, burro, salvia");
    expect(prompt).toContain("Do not add visible ingredients");
    expect(prompt).toContain("Avoid CGI, 3D render");
    expect(prompt).toContain("Never force every item onto the same generic ceramic plate");
    expect(prompt).toContain("No collage, no border, no typography");
    expect(menuImageSourceHash({ ...source, description: "Testo nuovo" }))
      .not.toBe(menuImageSourceHash(source));
  });

  it("chooses shared boards and beverage glassware from menu context", () => {
    const board = { ...source, name: "Tagliere della casa", category: "Taglieri" };
    const cocktail = {
      ...source,
      name: "Signature Martini",
      category: "Cocktail",
      description: "Servito in coppetta coupe",
      ingredients: "Gin, vermouth dry",
      vegetarian: false,
    };
    expect(menuImagePresentation(board)).toBe("board");
    expect(menuImagePrompt(board)).toContain("credible shared assortment");
    expect(menuImagePrompt(board)).toContain("Never compress a tagliere into a sparse ceramic plate");
    expect(menuImagePresentation(cocktail)).toBe("cocktail");
    expect(menuImagePrompt(cocktail)).toContain("explicitly requested coupe/coppetta glass");
    expect(menuImagePrompt(cocktail)).not.toContain("no drinks");
  });

  it("does not mistake food ingredients or dessert cups for beverages", () => {
    expect(menuImagePresentation({
      ...source,
      name: "Risotto al vino rosso",
      category: "Primi",
      description: "Mantecato con riduzione di vino rosso",
      ingredients: "Riso, burro, vino rosso",
    })).toBe("dish");
    expect(menuImagePresentation({
      ...source,
      name: "Coppetta gelato",
      category: "Dolci",
      description: "Tre gusti della casa",
    })).toBe("dessert");
    expect(menuImagePresentation({
      ...source,
      name: "Chianti Classico",
      category: "Vini rossi",
      description: "Calice da 125 ml",
    })).toBe("wine");
    expect(menuImagePresentation({
      ...source,
      name: "Signature della casa",
      category: "Bevande",
      description: "Servito freddo in coppetta coupe",
    })).toBe("cocktail");
  });

  it("adds optional reviewer direction without changing normalized source freshness", () => {
    const prompt = menuImagePrompt(source, "Usa una ciotola bassa blu opaca");
    expect(prompt).toContain("Additional visual direction from the reviewer");
    expect(prompt).toContain("Usa una ciotola bassa blu opaca");
    expect(menuImageSourceHash(source)).toBe(menuImageSourceHash(source));
  });

  it("allows only the approved logo reference when branding is requested", () => {
    const prompt = menuImagePrompt(source, "", { includeRestaurantLogo: true });

    expect(prompt).toContain("Reference image 1 is the restaurant's approved logo");
    expect(prompt).toContain("small, naturally integrated brand detail");
    expect(prompt).toContain("no typography beyond the approved logo reference");
    expect(prompt).not.toContain("Do not add labels, logos or typography");
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

    const result = await createMenuImage(source, { openai, instructions: "Sfondo chiaro" });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-image-2",
        n: 1,
        size: "1536x1024",
        quality: "medium",
        output_format: "webp",
        output_compression: 82,
        background: "opaque",
        prompt: expect.stringContaining("Sfondo chiaro"),
      }),
      { timeout: 240_000, maxRetries: 1 },
    );
    expect(result.bytes).toEqual(webp);
    expect(result.requestId).toBe("req-image-1");
  });

  it("uses a high-quality image edit when an approved logo reference is provided", async () => {
    delete process.env.OPENAI_IMAGE_MODEL;
    const webp = Buffer.from("RIFF0000WEBPgenerated-image");
    const edit = vi.fn(async () => ({
      data: [{ b64_json: webp.toString("base64") }],
      usage: { total_tokens: 456 },
      _request_id: "req-image-logo",
    }));
    const generate = vi.fn();
    const openai = { images: { edit, generate } } as unknown as OpenAI;

    const result = await createMenuImage(source, {
      openai,
      quality: "high",
      logoReference: {
        bytes: Buffer.from("RIFF0000WEBPapproved-logo"),
        mimeType: "image/webp",
      },
    });

    expect(edit).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-image-2",
        image: expect.anything(),
        size: "1536x1024",
        quality: "high",
        output_format: "webp",
        prompt: expect.stringContaining("restaurant's approved logo"),
      }),
      { timeout: 240_000, maxRetries: 1 },
    );
    expect(generate).not.toHaveBeenCalled();
    expect(result.bytes).toEqual(webp);
    expect(result.requestId).toBe("req-image-logo");
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
