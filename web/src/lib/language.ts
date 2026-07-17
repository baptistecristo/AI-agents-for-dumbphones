// Langues supportées (FR/EN/ES — pivot open-source).
// Une seule source de vérité pour le type et les valeurs par défaut.

import { envOr } from "./env";

export type Language = "fr" | "en" | "es";

// Toute valeur inattendue (null, ancienne locale, faute de frappe) retombe sur 'fr'.
export function normalizeLanguage(value: string | null | undefined): Language {
  return value === "en" || value === "es" ? value : "fr";
}

// Langue servie à un appelant inconnu (env DEFAULT_LANGUAGE, défaut 'fr').
export function defaultLanguage(): Language {
  return normalizeLanguage(envOr("DEFAULT_LANGUAGE", "fr"));
}
