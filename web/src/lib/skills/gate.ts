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
// "code" = ce dont la fuite OU la destruction fait mal si le caller-ID est
// usurpé : l'agenda (lire, créer, déplacer), les contacts, les notes relues,
// tout ce qui engage le compte vers l'extérieur (un SMS envoyé, un appel passé
// en son nom), et mark_done (voir plus bas).
//
// "free" = météo, heure, itinéraire, prise de note, et les rappels qu'on lit ou
// qu'on ajoute (poser, lister, « est-ce que j'ai déjà… ? »). Les rappels RESTENT
// des données personnelles : c'est un arbitrage assumé, pas un oubli. Exiger un
// code pour « est-ce que j'ai déjà pris mes cachets ? » coûte plus cher que le
// risque couvert, précisément au moment où la fonction sert. Les outils d'auth
// eux-mêmes sont libres, sinon rien ne pourrait jamais se débloquer.
//
// Cet arbitrage tient parce que ces trois-là lisent ou ajoutent. Il ne s'étend
// pas à mark_done, qui ÉTEINT : le rappel passe à "done", donc le cron ne
// l'enverra jamais. Libre, il offrait à qui usurpe le caller-ID de supprimer en
// silence le rappel de 8 h, et un rappel qui n'arrive pas ne se remarque pas.
// Ici le risque n'est pas la fuite mais la suppression, et elle coûte plus cher
// que la friction du code.
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
  // Éteint un rappel que le cron devait envoyer : destructif, et silencieux.
  mark_done: "code",

  // Rappels : lecture et ajout
  set_reminder: "free",
  list_reminders: "free",
  did_i_already: "free",
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
