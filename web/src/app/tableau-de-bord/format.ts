// Formatage partagé de l'espace personnel : dates, langue, débit de parole.
// Une seule source de vérité pour ces libellés, réutilisée par toutes les
// sections (aperçu, mon agent, mémoire), afin que le même réglage se lise
// toujours pareil d'une page à l'autre.

import { clampVoiceSpeed } from "@/lib/agents/inbound";
import { Language, normalizeLanguage } from "@/lib/language";

// Locale d'affichage par langue du site. Le fuseau reste Europe/Paris.
const DATE_LOCALES: Record<Language, string> = { fr: "fr-FR", en: "en-GB", es: "es-ES" };

export function fr(dt: string | null, lang: Language = "fr"): string {
  if (!dt) return "—";
  return new Intl.DateTimeFormat(DATE_LOCALES[lang], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(dt));
}

// Chaque langue se lit dans sa propre langue : le libellé ne dépend donc pas
// de la langue du site.
const LANGUAGE_LABELS: Record<Language, string> = { fr: "Français", en: "English", es: "Español" };

export function languageLabel(preferred: string | null | undefined): string {
  return LANGUAGE_LABELS[normalizeLanguage(preferred)];
}

// Débit de parole : des mots, pas des chiffres. « 0,85 » ne veut rien dire pour
// une oreille, et une liste fermée ne peut produire qu'une valeur acceptée par
// ElevenLabs (0.7 – 1.2) — le curseur libre, lui, invite à taper n'importe quoi.
// Le libellé existe dans chaque langue du site (`labels`), la valeur reste unique.
export const VOICE_SPEED_CHOICES: { value: number; labels: Record<Language, string> }[] = [
  { value: 0.7, labels: { fr: "Lent", en: "Slow", es: "Lento" } },
  { value: 0.85, labels: { fr: "Posé", en: "Measured", es: "Pausado" } },
  { value: 1.0, labels: { fr: "Normal", en: "Normal", es: "Normal" } },
  { value: 1.1, labels: { fr: "Vif", en: "Brisk", es: "Vivo" } },
  { value: 1.2, labels: { fr: "Rapide", en: "Fast", es: "Rápido" } },
];

// Un profil peut porter un débit absent de la liste (ancien défaut, valeur
// écrite en base) : on présélectionne l'option la plus proche, sinon le
// formulaire afficherait « Lent » et l'enregistrement ralentirait l'agent sans
// que personne ne l'ait demandé.
export function nearestVoiceSpeed(stored: unknown): number {
  const speed = clampVoiceSpeed(stored);
  return VOICE_SPEED_CHOICES.reduce((best, choice) =>
    Math.abs(choice.value - speed) < Math.abs(best.value - speed) ? choice : best,
  ).value;
}

export function voiceSpeedLabel(stored: unknown, lang: Language): string {
  const value = nearestVoiceSpeed(stored);
  return VOICE_SPEED_CHOICES.find((c) => c.value === value)?.labels[lang] ?? "Normal";
}
