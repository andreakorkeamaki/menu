import type { Locale } from "@/types/domain";

export const PUBLIC_ERROR_COPY: Record<Locale, {
  eyebrow: string;
  title: string;
  detail: string;
  retry: string;
  home: string;
}> = {
  it: { eyebrow: "Menu temporaneamente non disponibile", title: "Non riusciamo ad aprire il menu.", detail: "Il QR resta valido. Riprova tra un momento: non devi scansionarlo di nuovo.", retry: "Riprova il menu", home: "Vai alla pagina iniziale" },
  en: { eyebrow: "Menu temporarily unavailable", title: "We can’t open the menu right now.", detail: "The QR is still valid. Try again in a moment—you won’t need to scan it again.", retry: "Try the menu again", home: "Go to the home page" },
  fr: { eyebrow: "Menu temporairement indisponible", title: "Impossible d’ouvrir le menu pour le moment.", detail: "Le QR reste valide. Réessayez dans un instant, sans le scanner à nouveau.", retry: "Réessayer", home: "Aller à l’accueil" },
  de: { eyebrow: "Menü vorübergehend nicht verfügbar", title: "Das Menü kann gerade nicht geöffnet werden.", detail: "Der QR-Code bleibt gültig. Versuchen Sie es gleich erneut, ohne neu zu scannen.", retry: "Menü erneut öffnen", home: "Zur Startseite" },
  es: { eyebrow: "Menú temporalmente no disponible", title: "Ahora mismo no podemos abrir el menú.", detail: "El QR sigue siendo válido. Inténtalo de nuevo en un momento, sin volver a escanearlo.", retry: "Reintentar", home: "Ir a la página de inicio" },
};

export function publicErrorLocale(pathname: string): Locale {
  const tail = pathname.split("/").filter(Boolean).at(-1);
  return tail === "en" || tail === "fr" || tail === "de" || tail === "es" ? tail : "it";
}
