// Formatage partagé de l'espace personnel : dates, langue, débit de parole.
// Une seule source de vérité pour ces libellés, réutilisée par toutes les
// sections (aperçu, mon agent, mémoire), afin que le même réglage se lise
// toujours pareil d'une page à l'autre.

import { clampVoiceSpeed } from "@/lib/agents/inbound";
import { normalizeLanguage } from "@/lib/language";

export function fr(dt: string | null): string {
  if (!dt) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(dt));
}

export function languageLabel(preferred: string | null | undefined): string {
  return normalizeLanguage(preferred) === "en" ? "English" : "Français";
}

// Débit de parole : des mots, pas des chiffres. « 0,85 » ne veut rien dire pour
// une oreille, et une liste fermée ne peut produire qu'une valeur acceptée par
// ElevenLabs (0.7 – 1.2) — le curseur libre, lui, invite à taper n'importe quoi.
export const VOICE_SPEED_CHOICES: { value: number; label: string }[] = [
  { value: 0.7, label: "Lent" },
  { value: 0.85, label: "Posé" },
  { value: 1.0, label: "Normal" },
  { value: 1.1, label: "Vif" },
  { value: 1.2, label: "Rapide" },
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

export function voiceSpeedLabel(stored: unknown): string {
  const value = nearestVoiceSpeed(stored);
  return VOICE_SPEED_CHOICES.find((c) => c.value === value)?.label ?? "Normal";
}
