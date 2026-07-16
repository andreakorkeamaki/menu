import type { Locale, LocalizedText } from "@/types/domain";

type AllergenDefinition = {
  aliases: string[];
  labels: Record<Locale, string>;
};

const ALLERGENS: AllergenDefinition[] = [
  {
    aliases: ["gluten", "glutine"],
    labels: { it: "Glutine", en: "Gluten", fr: "Gluten", de: "Gluten", es: "Gluten" },
  },
  {
    aliases: ["crustaceans", "crustacean", "crostacei"],
    labels: { it: "Crostacei", en: "Crustaceans", fr: "Crustacés", de: "Krebstiere", es: "Crustáceos" },
  },
  {
    aliases: ["eggs", "egg", "uova", "uovo"],
    labels: { it: "Uova", en: "Eggs", fr: "Œufs", de: "Eier", es: "Huevos" },
  },
  {
    aliases: ["fish", "pesce"],
    labels: { it: "Pesce", en: "Fish", fr: "Poisson", de: "Fisch", es: "Pescado" },
  },
  {
    aliases: ["peanuts", "peanut", "arachidi"],
    labels: { it: "Arachidi", en: "Peanuts", fr: "Arachides", de: "Erdnüsse", es: "Cacahuetes" },
  },
  {
    aliases: ["soy", "soya", "soia"],
    labels: { it: "Soia", en: "Soy", fr: "Soja", de: "Soja", es: "Soja" },
  },
  {
    aliases: ["milk", "latte"],
    labels: { it: "Latte", en: "Milk", fr: "Lait", de: "Milch", es: "Leche" },
  },
  {
    aliases: ["nuts", "tree nuts", "tree_nuts", "frutta a guscio"],
    labels: { it: "Frutta a guscio", en: "Tree nuts", fr: "Fruits à coque", de: "Schalenfrüchte", es: "Frutos de cáscara" },
  },
  {
    aliases: ["celery", "sedano"],
    labels: { it: "Sedano", en: "Celery", fr: "Céleri", de: "Sellerie", es: "Apio" },
  },
  {
    aliases: ["mustard", "senape"],
    labels: { it: "Senape", en: "Mustard", fr: "Moutarde", de: "Senf", es: "Mostaza" },
  },
  {
    aliases: ["sesame", "sesame seeds", "semi di sesamo"],
    labels: { it: "Semi di sesamo", en: "Sesame", fr: "Sésame", de: "Sesam", es: "Sésamo" },
  },
  {
    aliases: ["sulphites", "sulfites", "sulphur dioxide", "anidride solforosa e solfiti", "solfiti"],
    labels: { it: "Anidride solforosa e solfiti", en: "Sulphites", fr: "Sulfites", de: "Sulfite", es: "Sulfitos" },
  },
  {
    aliases: ["lupin", "lupins", "lupini"],
    labels: { it: "Lupini", en: "Lupin", fr: "Lupin", de: "Lupinen", es: "Altramuces" },
  },
  {
    aliases: ["molluscs", "mollusks", "molluschi"],
    labels: { it: "Molluschi", en: "Molluscs", fr: "Mollusques", de: "Weichtiere", es: "Moluscos" },
  },
];

const DAY_LABELS: Record<Locale, Record<string, string>> = {
  it: { mon: "Lun", tue: "Mar", wed: "Mer", thu: "Gio", fri: "Ven", sat: "Sab", sun: "Dom" },
  en: { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" },
  fr: { mon: "Lun", tue: "Mar", wed: "Mer", thu: "Jeu", fri: "Ven", sat: "Sam", sun: "Dim" },
  de: { mon: "Mo", tue: "Di", wed: "Mi", thu: "Do", fri: "Fr", sat: "Sa", sun: "So" },
  es: { mon: "Lun", tue: "Mar", wed: "Mié", thu: "Jue", fri: "Vie", sat: "Sáb", sun: "Dom" },
};

const DAY_ALIASES: Record<string, string> = {
  lun: "mon", lunedi: "mon", mon: "mon", monday: "mon", montag: "mon", lunes: "mon",
  mar: "tue", martedi: "tue", tue: "tue", tuesday: "tue", di: "tue", dienstag: "tue", martes: "tue",
  mer: "wed", mercoledi: "wed", wed: "wed", wednesday: "wed", mi: "wed", mittwoch: "wed", mie: "wed", miercoles: "wed",
  gio: "thu", giovedi: "thu", thu: "thu", thursday: "thu", jeu: "thu", do: "thu", donnerstag: "thu", jue: "thu", jueves: "thu",
  ven: "fri", venerdi: "fri", fri: "fri", friday: "fri", fr: "fri", freitag: "fri", vie: "fri", viernes: "fri",
  sab: "sat", sabato: "sat", sat: "sat", saturday: "sat", sam: "sat", sa: "sat", samstag: "sat", sabado: "sat",
  dom: "sun", domenica: "sun", sun: "sun", sunday: "sun", dim: "sun", so: "sun", sonntag: "sun", domingo: "sun",
};

const EVERY_DAY: Record<Locale, string> = {
  it: "Tutti i giorni",
  en: "Every day",
  fr: "Tous les jours",
  de: "Täglich",
  es: "Todos los días",
};

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

const ALLERGEN_BY_ALIAS = new Map(
  ALLERGENS.flatMap((definition) =>
    [...definition.aliases, ...Object.values(definition.labels)].map((alias) => [normalizeLabel(alias), definition] as const),
  ),
);

export function localizeAllergen(value: string, locale: Locale) {
  return ALLERGEN_BY_ALIAS.get(normalizeLabel(value))?.labels[locale] ?? value;
}

export function localizeOpeningDays(value: string, locale: Locale) {
  const normalized = normalizeLabel(value);
  if (["tutti i giorni", "every day", "tous les jours", "taglich", "todos los dias"].includes(normalized)) {
    return EVERY_DAY[locale];
  }

  const parts = value.split(/\s*[–—-]\s*/u);
  const dayIds = parts.map((part) => DAY_ALIASES[normalizeLabel(part)]);
  if (dayIds.some((dayId) => !dayId)) return value;
  return dayIds.map((dayId) => DAY_LABELS[locale][dayId]).join("–");
}

export function localizedMenuName(value: string | LocalizedText, locale: Locale) {
  return typeof value === "string" ? value : value[locale] || value.it;
}
