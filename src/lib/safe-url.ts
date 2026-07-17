import { z } from "zod";

export function safeHttpUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export const OptionalHttpUrlSchema = z.union([
  z.string().trim().refine((value) => safeHttpUrl(value) !== null, "Inserisci un link http o https."),
  z.literal(""),
]);
