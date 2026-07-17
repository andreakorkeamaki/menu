import OpenAI, { toFile } from "openai";
import { z } from "zod";
import { createOpenAIClient } from "@/lib/ai/client";
import { getImageModel } from "@/lib/ai/config";
import { sourceHash } from "@/lib/ai/source-hash";
import { detectBrandImageMime, MENU_ITEM_MEDIA_MAX_BYTES } from "@/lib/brand-media";

export const MENU_IMAGE_PROMPT_VERSION = "menu-image-v3";
export const MenuImageQualitySchema = z.enum(["medium", "high"]);
export type MenuImageQuality = z.infer<typeof MenuImageQualitySchema>;
export const MENU_IMAGE_QUALITY: MenuImageQuality = "medium";
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

export const MenuImageInstructionsSchema = z.string().trim().max(1_000);

export type MenuImagePresentation =
  | "board"
  | "cocktail"
  | "wine"
  | "drink"
  | "dessert"
  | "dish";

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

function searchableMenuText(source: MenuImageSource) {
  return [source.name, source.category, source.description, source.ingredients]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("it-IT");
}

function normalizedMenuText(...values: Array<string | null>) {
  return values.filter(Boolean).join(" ").toLocaleLowerCase("it-IT");
}

export function menuImagePresentation(source: MenuImageSource): MenuImagePresentation {
  const input = MenuImageSourceSchema.parse(source);
  const category = normalizedMenuText(input.category);
  const title = normalizedMenuText(input.name, input.category);
  const description = normalizedMenuText(input.description);
  const boardCue = /\b(taglier[ei]|charcuterie|assortimento|selezione (?:di )?(?:salumi|formaggi)|salumi (?:e|con) formaggi|formaggi (?:e|con) salumi|formaggi misti)\b/;
  const cocktailCue = /\b(cocktail|mocktail|spritz|martini|negroni|coupe)\b/;
  const wineCue = /\b(vin[oi]|wine|ros[ée]|bollicine|prosecco|champagne|calice)\b/;
  const drinkCue = /\b(bibit[ae]|bevanda|drink|aperitiv[oi]|birra|beer|soda|cola|limonata|acqua|caff[eè]|t[eè]|succo|frullato)\b/;
  const dessertCue = /\b(dolc[ei]|dessert|torta|tiramis[uù]|gelato|sorbetto|semifreddo|panna cotta|cheesecake|biscott[io])\b/;
  const foodCategory = /\b(antipast[oi]|prim[oi]|second[oi]|contorn[oi]|piatt[oi]|pizz[ae]|past[ae]|carn[ei]|pesc[ei]|insalat[ae]|panin[oi]|burger)\b/;

  if (boardCue.test(title)) return "board";
  if (foodCategory.test(category)) return "dish";
  if (cocktailCue.test(title)) return "cocktail";
  if (wineCue.test(title)) return "wine";
  if (dessertCue.test(title)) return "dessert";

  // Descriptive fallbacks help generically named products, while ingredients
  // remain prompt evidence rather than overriding an explicit food category.
  if (boardCue.test(description)) return "board";
  if (cocktailCue.test(description)) return "cocktail";
  if (wineCue.test(description)) return "wine";
  if (drinkCue.test(title)) return "drink";
  if (drinkCue.test(description)) return "drink";
  if (dessertCue.test(description)) return "dessert";
  return "dish";
}

function presentationDirection(source: MenuImageSource) {
  const presentation = menuImagePresentation(source);
  if (presentation === "board") {
    return "Present it as a generous, credible shared assortment on an appropriately sized wooden or stone serving board. Make multiple portions and the variety of the stated components immediately legible. Never compress a tagliere into a sparse ceramic plate.";
  }
  if (presentation === "cocktail") {
    const text = searchableMenuText(source);
    const coupe = /\b(coupe|coppetta)\b/.test(text);
    return coupe
      ? "Present the drink in the explicitly requested coupe/coppetta glass, with realistic liquid level, ice and garnish only when supported by the menu text. Do not place the drink in a bowl, plate or generic tumbler."
      : "Choose authentic cocktail glassware that matches the named drink, with realistic liquid level, ice and garnish only when supported by the menu text. Do not place the drink in a bowl or on a plate.";
  }
  if (presentation === "wine") {
    return "Present the wine or sparkling wine as the actual menu product in suitable, true-to-life wine glassware; include a bottle only when the menu wording implies one. Do not place the beverage in food crockery.";
  }
  if (presentation === "drink") {
    return "Present the beverage in the contextually correct glass, cup or bottle for the named product, with natural liquid colour and fill level. Do not place it in a food bowl or on a plate.";
  }
  if (presentation === "dessert") {
    return "Choose dessert service that fits the named preparation: a small plate, bowl, glass or cup as appropriate. Preserve believable texture, scale and portion size rather than forcing every dessert onto the same plate.";
  }
  return "Choose the serving vessel from the food itself: use a plate, shallow bowl, deep bowl, baking dish or other authentic restaurant service only when contextually appropriate. Never force every item onto the same generic ceramic plate.";
}

export function menuImagePrompt(
  source: MenuImageSource,
  instructions = "",
  options: { includeRestaurantLogo?: boolean } = {},
) {
  const input = MenuImageSourceSchema.parse(source);
  const additionalInstructions = MenuImageInstructionsSchema.parse(instructions);
  const includeRestaurantLogo = options.includeRestaurantLogo === true;
  const dietaryNotes = [
    input.vegan ? "vegan" : input.vegetarian ? "vegetarian" : null,
    input.gluten_free ? "gluten-free" : null,
  ].filter(Boolean).join(", ");

  const brandDirection = includeRestaurantLogo
    ? `Reference image 1 is the restaurant's approved logo. Reproduce that exact logo only once as a small, naturally integrated brand detail on a plausible service object such as a clean fabric napkin, paper menu card or coaster. Preserve its proportions, colours and lettering; never reinterpret it, invent replacement text, turn it into a watermark or place it over the food. If faithful integration is not visually plausible, keep it small and secondary rather than changing the logo.`
    : "Do not add labels, logos or typography.";

  return `Create one highly photorealistic editorial restaurant photograph of the exact menu product described below.

Product name: ${input.name}
Menu category: ${input.category}
Description: ${input.description || "No additional description provided."}
Ingredients explicitly provided: ${input.ingredients || "No ingredient list provided."}
Dietary information: ${dietaryNotes || "No dietary claim provided."}

Interpret whether this is a plated dish, a shared board, a dessert, a cocktail, a wine or another beverage from its name, category, description and ingredients. ${presentationDirection(input)}

The subject must remain faithful to the supplied menu information. Do not add visible ingredients, garnishes, sauces, side dishes, people, hands or decorative props that are not supported by the description. ${brandDirection} When details are unspecified, choose a restrained and plausible Italian restaurant presentation without inventing a distinctive ingredient. Respect every dietary statement.

Use real food photography characteristics: natural portions, true-to-life colours, small organic irregularities, realistic moisture and texture, physically plausible glass, ceramic, wood and reflections. Avoid CGI, 3D render, illustration, waxy surfaces, plastic-looking food, excessive gloss, impossible geometry, over-saturation and advertising-style abundance.

${additionalInstructions ? `Additional visual direction from the reviewer: ${additionalInstructions}\nApply it when consistent with the menu facts and the safety constraints above.\n` : ""}
Use a consistent, understated restaurant style: soft warm daylight, neutral stone or wood tabletop selected to suit the product, appetising but not exaggerated, three-quarter camera angle and gentle shallow depth of field. Show the complete product centred with generous safe margins so it can be cropped to a 4:3 menu card. No collage, no border${includeRestaurantLogo ? "; no typography beyond the approved logo reference" : ", no typography"}.`;
}

export interface CreateMenuImageOptions {
  openai?: OpenAI;
  instructions?: string;
  quality?: MenuImageQuality;
  logoReference?: {
    bytes: Buffer;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
  };
}

export async function createMenuImage(
  source: MenuImageSource,
  options: CreateMenuImageOptions = {},
) {
  const input = MenuImageSourceSchema.parse(source);
  const instructions = MenuImageInstructionsSchema.parse(options.instructions ?? "");
  const quality = MenuImageQualitySchema.parse(options.quality ?? MENU_IMAGE_QUALITY);
  const model = getImageModel();
  const openai = options.openai ?? createOpenAIClient();
  const prompt = menuImagePrompt(input, instructions, {
    includeRestaurantLogo: Boolean(options.logoReference),
  });
  const requestOptions = { timeout: 240_000, maxRetries: 1 };
  const response = options.logoReference
    ? await openai.images.edit({
      model,
      image: await toFile(
        options.logoReference.bytes,
        `restaurant-logo.${options.logoReference.mimeType.split("/")[1]}`,
        { type: options.logoReference.mimeType },
      ),
      prompt,
      n: 1,
      size: MENU_IMAGE_SIZE,
      quality,
      output_format: MENU_IMAGE_FORMAT,
      output_compression: MENU_IMAGE_COMPRESSION,
      background: "opaque",
    }, requestOptions)
    : await openai.images.generate({
      model,
      prompt,
      n: 1,
      size: MENU_IMAGE_SIZE,
      quality,
      output_format: MENU_IMAGE_FORMAT,
      output_compression: MENU_IMAGE_COMPRESSION,
      background: "opaque",
      moderation: "auto",
    }, requestOptions);
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
