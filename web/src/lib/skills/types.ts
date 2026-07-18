// Contexte d'exécution d'un outil pendant un appel.

import { Language } from "../language";

export type CallSession = {
  callId: string; // id d'appel Vapi (ou id de fil, pour le canal texte)
  // Canal d'où vient le tour. La couche skills est identique pour les deux ;
  // seul le gate diffère (voix : code jetable ; texte : PIN, écritures seules
  // — voir gate.ts). "voice" par défaut historique.
  channel: "voice" | "text";
  userId: string | null;
  callerNumber: string | null;
  verified: boolean; // code SMS (Twilio Verify) validé sur cet appel
  language: Language; // langue de l'appel (profil, sinon DEFAULT_LANGUAGE)
};

// Chaque skill renvoie un texte (dans la langue de l'appel) que l'agent lira/paraphrasera.
export type SkillResult = string;

// Sélection FR/EN/ES d'une chaîne destinée à l'appelant. Les trois clés sont
// obligatoires : une langue ajoutée sans ses chaînes ne compile pas.
export function t(
  session: Pick<CallSession, "language">,
  s: { fr: string; en: string; es: string },
): string {
  return s[session.language] ?? s.fr;
}

const DATE_LOCALES: Record<Language, string> = { fr: "fr-FR", en: "en-GB", es: "es-ES" };

export function formatDate(iso: string | Date, language: Language): string {
  return new Intl.DateTimeFormat(DATE_LOCALES[language] ?? "fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

export function parisDayBounds(day: string): { start: Date; end: Date; label: string } {
  const now = new Date();
  const todayParis = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(now); // AAAA-MM-JJ
  let dateStr = day;
  if (day === "today" || day === "aujourd'hui") dateStr = todayParis;
  if (day === "tomorrow" || day === "demain") {
    const t = new Date(`${todayParis}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() + 1);
    dateStr = t.toISOString().slice(0, 10);
  }
  // Bornes larges (UTC±2) : suffisant pour lister une journée française.
  return {
    start: new Date(`${dateStr}T00:00:00+02:00`),
    end: new Date(`${dateStr}T23:59:59+02:00`),
    label: dateStr,
  };
}
