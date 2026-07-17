import OpenAI from "openai";
import { z } from "zod";
import { createOpenAIClient } from "@/lib/ai/client";
import { getImageModel } from "@/lib/ai/config";
import { sourceHash } from "@/lib/ai/source-hash";
import { detectBrandImageMime, MENU_ITEM_MEDIA_MAX_BYTES } from "@/lib/brand-media";

export const MENU_IMAGE_PROMPT_VERSION = "menu-image-v1";
export const MENU_IMAGE_QUALITY = "medium" as const;
export const MENU_IMAGE_SIZE = "1536x1024" as const;
export const MENU_IMAGE_FORMAT = "webp" as const;
export const MENU_IMAGE_COMPRESSION = 82;

export const MenuImageSourceSchema = z.object({
  item_id: z.uuid(),
  name: z.string().trim().min(1).max(240),
  category: z.string().trim().min(1).max(240),
  description: z.string().trim().max(2_000).nullable(),
  ingredients: z.string().trim().max(4_000).nullable(),
  vegetarian: z.boolean(),
  vegan: z.boolean(),
  gluten_free: z.boolean(),
});

export type MenuImageSource = z.infer<typeof MenuImageSourceSchema>;

export function menuImageSourceFromItem(
  item: {
    id: string;
    name_it: string;
    description_it: string | null;
    ingredients_it: string | null;
    vegetarian: boolean;
    vegan: boolean;
    gluten_free: boolean;
  },
  categoryName: string,
) {
  return MenuImageSourceSchema.parse({
    item_id: item.id,
    name: item.name_it,
    category: categoryName,
    description: item.description_it,
    ingredients: item.ingredients_it,
    vegetarian: item.vegetarian,
    vegan: item.vegan,
    gluten_free: item.gluten_free,
  });
}

export function menuImageSourceHash(source: MenuImageSource) {
  return sourceHash(JSON.stringify(MenuImageSourceSchema.parse(source)));
}

export function menuImagePrompt(source: MenuImageSource) {
  const input = MenuImageSourceSchema.parse(source);
  const dietaryNotes = [
    input.vegan ? "vegan" : input.vegetarian ? "vegetarian" : null,
    input.gluten_free ? "gluten-free" : null,
  ].filter(Boolean).join(", ");

  return `Create one realistic editorial restaurant photograph of the following dish.

Dish name: ${input.name}
Menu category: ${input.category}
Description: ${input.description || "No additional description provided."}
Ingredients explicitly provided: ${input.ingredients || "No ingredient list provided."}
Dietary information: ${dietaryNotes || "No dietary claim provided."}

The food must remain faithful to the supplied menu information. Do not add visible ingredients, garnishes, sauces, side dishes, labels, logos, text, people, hands, cutlery, drinks, or decorative props that are not supported by the description. When details are unspecified, choose a restrained and plausible Italian restaurant presentation without inventing a distinctive ingredient.

Use a consistent natural restaurant style: soft warm daylight, neutral stone tabletop, understated ceramic plate, true-to-life colours, appetising but not exaggerated, three-quarter camera angle, shallow depth of field. Show the complete plate centred with generous safe margins so it can be cropped to a 4:3 menu card. No collage, no border, no typography.`;
}

export interface CreateMenuImageOptions {
  openai?: OpenAI;
}

export async function createMenuImage(
  source: MenuImageSource,
  options: CreateMenuImageOptions = {},
) {
  const input = MenuImageSourceSchema.parse(source);
  const model = getImageModel();
  const openai = options.openai ?? createOpenAIClient();
  const response = await openai.images.generate(
    {
      model,
      prompt: menuImagePrompt(input),
      n: 1,
      size: MENU_IMAGE_SIZE,
      quality: MENU_IMAGE_QUALITY,
      output_format: MENU_IMAGE_FORMAT,
      output_compression: MENU_IMAGE_COMPRESSION,
      background: "opaque",
      moderation: "auto",
    },
    { timeout: 240_000, maxRetries: 1 },
  );
  const encoded = response.data?.[0]?.b64_json;
  if (!encoded) {
    throw new Error("OpenAI non ha restituito i dati dell’immagine.");
  }

  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.length === 0
    || bytes.length > MENU_ITEM_MEDIA_MAX_BYTES
    || detectBrandImageMime(bytes.subarray(0, 12)) !== "image/webp"
  ) {
    throw new Error("OpenAI ha restituito un file immagine non valido.");
  }

  return {
    bytes,
    model,
    requestId: response._request_id ?? null,
    usage: response.usage ?? null,
  };
}
