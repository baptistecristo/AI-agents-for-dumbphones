// Source unique de vérité : quels outils exigent le code SMS (session.verified).
//
// Ce fichier est une liste EXHAUSTIVE, pas une liste des seuls outils sensibles.
// Chaque outil déclaré dans agents/tools.ts doit apparaître ici, et un outil
// absent ne s'exécute pas du tout (voir index.ts). C'est délibéré : la version
// précédente n'énumérait que les outils protégés, donc un skill oublié partait
// en libre-service, silencieusement — aucune erreur de type, aucun test rouge,
// rien à voir en relecture. Un oubli doit casser bruyamment le skill de son
// auteur, jamais ouvrir en douce les données de quelqu'un d'autre.
//
// "code" = ce dont la fuite fait mal si le caller-ID est usurpé : l'agenda
// (lire, créer, déplacer), les contacts, les notes relues, et tout ce qui engage
// le compte vers l'extérieur (un SMS envoyé, un appel passé en son nom).
//
// "free" = météo, heure, itinéraire, prise de note, et les rappels (poser,
// lister, marquer fait, « est-ce que j'ai déjà… ? »). Les rappels RESTENT des
// données personnelles : c'est un arbitrage assumé, pas un oubli. Exiger un code
// pour « est-ce que j'ai déjà pris mes cachets ? » coûte plus cher que le risque
// couvert, précisément au moment où la fonction sert. Les outils d'auth
// eux-mêmes sont libres, sinon rien ne pourrait jamais se débloquer.
//
// Attention : « get_directions est free » ne veut PAS dire « l'adresse du
// domicile est libre ». Ce fichier ne classe que des NOMS d'outils ; il ne voit
// pas les arguments. L'origine par défaut de get_directions n'est donnée qu'à un
// appelant vérifié, et ça se joue dans index.ts. Une donnée qui ENTRE dans un
// outil se protège là-bas, pas ici.
export type ToolPolicy = "code" | "free";

export const TOOL_POLICY = {
  // Agenda
  list_events: "code",
  create_event: "code",
  move_event: "code",
  // Contacts, mémoire relue
  find_contact: "code",
  recall: "code",
  // Engage le compte vers l'extérieur
  send_sms: "code",
  place_call: "code",

  // Rappels
  set_reminder: "free",
  list_reminders: "free",
  did_i_already: "free",
  mark_done: "free",
  // Questions générales
  get_weather: "free",
  get_current_time: "free",
  get_directions: "free",
  // Écriture légère
  remember: "free",
  // Auth : doivent rester libres pour pouvoir débloquer le reste
  request_code: "free",
  verify_code: "free",
} as const satisfies Record<string, ToolPolicy>;

export type ToolName = keyof typeof TOOL_POLICY;

// Un outil non classé n'est pas exécutable (index.ts s'arrête avant le switch).
// gate.test.ts compare cette liste à agents/tools.ts dans les deux sens : y
// ajouter un outil sans le classer casse le test, pas la confidentialité.
export function isClassified(name: string): name is ToolName {
  return Object.hasOwn(TOOL_POLICY, name);
}

// Fail-closed : un nom inconnu exige le code. isClassified() l'aura déjà arrêté,
// mais cette fonction ne doit pas dépendre de l'ordre des vérifications de son
// appelant pour être sûre.
export function requiresVerification(name: string): boolean {
  return !isClassified(name) || TOOL_POLICY[name] === "code";
}
