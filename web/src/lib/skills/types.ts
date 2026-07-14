// Contexte d'exécution d'un outil pendant un appel.
export type CallSession = {
  callId: string; // id d'appel Vapi
  userId: string | null;
  callerNumber: string | null;
  pinVerified: boolean;
  language?: string | null;
};

// Chaque skill renvoie un texte que l'agent lira/paraphrasera.
export type SkillResult = string;

export function isEnglishLanguage(language?: string | null): boolean {
  return Boolean(language && language.toLowerCase().startsWith("en"));
}

export function localizedText(language: string | null | undefined, french: string, english: string): string {
  return isEnglishLanguage(language) ? english : french;
}

export function frDate(iso: string | Date, language?: string | null): string {
  const locale = isEnglishLanguage(language) ? "en-GB" : "fr-FR";
  return new Intl.DateTimeFormat(locale, {
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
