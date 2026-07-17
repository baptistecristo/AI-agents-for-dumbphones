// Langue d'affichage du SITE (FR/EN/ES) — indépendante de la langue de l'agent,
// qui vit dans profiles.preferred_language : on peut lire le site en anglais et
// se faire décrocher en espagnol. Un cookie, lu côté serveur ; toute valeur
// inattendue retombe sur 'fr' (normalizeLanguage). Lire le cookie rend la route
// dynamique — assumé : ce site est petit et déjà largement dynamique.

import { cookies } from "next/headers";
import { Language, normalizeLanguage } from "./language";

export const SITE_LANGUAGE_COOKIE = "site_lang";

export async function siteLanguage(): Promise<Language> {
  const store = await cookies();
  return normalizeLanguage(store.get(SITE_LANGUAGE_COOKIE)?.value);
}
