import { z } from "zod";

const optionalText = (max: number) => z.preprocess(
  (value) => value == null || (typeof value === "string" && value.trim() === "") ? undefined : value,
  z.string().trim().max(max).optional(),
);

const optionalHttpUrl = z.preprocess(
  (value) => value == null || (typeof value === "string" && value.trim() === "") ? undefined : value,
  z.url().refine((value) => value.startsWith("http://") || value.startsWith("https://"), "Inserisci un link http o https.").optional(),
);

export const DEMO_REQUEST_STATUSES = ["new", "contacted", "qualified", "converted", "closed"] as const;
export type DemoRequestStatus = (typeof DEMO_REQUEST_STATUSES)[number];

const nonNegativeInteger = z.coerce.number().int().nonnegative();

export const DemoRequestSubmissionResultSchema = z.object({
  accepted: z.boolean(),
  duplicate: z.boolean(),
  retry_after_seconds: nonNegativeInteger,
});

export const DemoRequestHealthSchema = z.object({
  accepted_24h: nonNegativeInteger,
  accepted_7d: nonNegativeInteger,
  duplicate_24h: nonNegativeInteger,
  blocked_24h: nonNegativeInteger,
  last_accepted_at: z.string().nullable(),
});

export const DemoRequestSchema = z.object({
  restaurant_name: z.string().trim().min(2, "Inserisci il nome del ristorante.").max(160),
  city: z.string().trim().min(2, "Inserisci la città.").max(120),
  contact_name: z.string().trim().min(2, "Inserisci il tuo nome.").max(160),
  email: z.email("Inserisci un indirizzo email valido.").max(320).transform((value) => value.toLocaleLowerCase("en-US")),
  phone: optionalText(40),
  contact_role: z.enum(["owner", "manager", "consultant", "other"], { error: "Seleziona il tuo ruolo." }),
  current_menu_url: optionalHttpUrl,
  desired_languages: z.array(z.enum(["en", "fr", "de", "es"])).max(4),
  notes: optionalText(2000),
  privacy_consent: z.literal("on", { error: "Conferma di aver letto l’informativa per inviare la richiesta." }),
  company: optionalText(200),
});

export type DemoRequestInput = z.infer<typeof DemoRequestSchema>;

export function parseDemoRequestFormData(formData: FormData) {
  return DemoRequestSchema.safeParse({
    restaurant_name: formData.get("restaurant_name"),
    city: formData.get("city"),
    contact_name: formData.get("contact_name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    contact_role: formData.get("contact_role"),
    current_menu_url: formData.get("current_menu_url"),
    desired_languages: formData.getAll("desired_languages"),
    notes: formData.get("notes"),
    privacy_consent: formData.get("privacy_consent"),
    company: formData.get("company"),
  });
}
