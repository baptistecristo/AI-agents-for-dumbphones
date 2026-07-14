// Source unique de vérité : quels outils exigent le code SMS (session.verified).
//
// Protégés = lire des données déjà stockées (agenda, contacts, rappels, notes),
// écrire dans un système externe (Google Agenda), ou envoyer/dépenser (SMS, appel).
// Libres = météo, questions générales, recherche de lieu, poser un rappel, prendre
// une note, et les outils d'auth eux-mêmes.
//
// Un outil inconnu est libre par défaut : le gate est une liste d'inclusion des
// outils sensibles connus. Tout NOUVEL outil touchant des données doit être ajouté
// ici explicitement.
const PROTECTED = new Set<string>([
  "list_events",
  "create_event",
  "move_event",
  "list_reminders",
  "did_i_already",
  "mark_done",
  "find_contact",
  "recall",
  "send_sms",
  "place_call",
]);

export function requiresVerification(name: string): boolean {
  return PROTECTED.has(name);
}
