"use server";

// Changer la langue du site. Les Server Components ne peuvent pas écrire de
// cookie : le sélecteur soumet donc un formulaire vers cette action, qui pose
// le cookie et laisse Next re-rendre la page dans la même réponse. La valeur
// vient d'un POST public : elle repasse par normalizeLanguage, comme toujours.

import { cookies } from "next/headers";
import { normalizeLanguage } from "./language";
import { SITE_LANGUAGE_COOKIE } from "./site-i18n";

export async function setSiteLanguage(formData: FormData): Promise<void> {
  const store = await cookies();
  store.set(SITE_LANGUAGE_COOKIE, normalizeLanguage(String(formData.get("lang") ?? "")), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
