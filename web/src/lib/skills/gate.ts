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
  // Relit le résumé de l'appel précédent : au moins aussi bavard que recall,
  // puisqu'il rapporte ce qui s'est DIT. L'opt-in (consents) décide si la
  // fonction existe pour cette personne ; le code décide qui peut l'entendre.
  get_last_call_summary: "code",

  // Rappels : lecture et ajout
  set_reminder: "free",
  list_reminders: "free",
  did_i_already: "free",
  // Questions générales
  get_weather: "free",
  get_current_time: "free",
  get_directions: "free",
  define: "free",
  convert: "free",
  // Écriture légère
  remember: "free",
  // Remonter un manque de capacité : aucune donnée stockée lue, rien d'envoyé
  // ni dépensé pendant l'appel — juste une note pour le mainteneur.
  report_unsupported_request: "free",
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

// ——— Le canal SMS ———
//
// Ce que le code protège n'est pas la même chose selon l'outil, et le SMS rend
// cette différence visible.
//
// "read"  = la donnée EST la réponse. Rien ne persiste.
// "write" = l'effet survit à la réponse, ou part vers un tiers.
//
// En appel, les deux exigent le code : l'usurpateur ENTEND la réponse, donc une
// lecture le sert directement. Par SMS, non — la réponse est envoyée à celui qui
// a écrit, c'est-à-dire au numéro ENREGISTRÉ, jamais à l'usurpateur, qui n'a
// aucun moyen de la lire. Il déclencherait une lecture que la victime seule
// reçoit. Une écriture, elle, s'exécute quoi qu'il arrive à la réponse : FAIT
// éteint le rappel, et le cron ne l'enverra plus.
//
// D'où la règle : par SMS, seules les écritures exigent le code — et comme un
// code ne peut pas se vérifier par SMS, elles sont simplement refusées là-bas.
//
// Ceci n'est PAS une seconde table qu'on tiendrait à la main à côté de la
// première : `Record<CodeToolName, …>` la dérive de TOOL_POLICY. Classer un
// nouvel outil "code" sans dire ce qu'il fait ne compile pas, et repasser un
// outil en "free" fait rejeter sa ligne ici. Les deux tables ne peuvent pas
// diverger en silence, ce qui était la seule bonne raison de n'en avoir qu'une.
export type ToolEffect = "read" | "write";

type CodeToolName = { [K in ToolName]: (typeof TOOL_POLICY)[K] extends "code" ? K : never }[ToolName];

export const CODE_TOOL_EFFECT = {
  list_events: "read",
  find_contact: "read",
  recall: "read",
  // "read" est exact : rien ne persiste après la réponse, et par TEXTE le résumé
  // est une lecture comme les autres. En VOIX il est en plus exclu du grant
  // durable, parce qu'il agrège — cf. AGGREGATE_READS plus bas.
  get_last_call_summary: "read",
  create_event: "write",
  move_event: "write",
  mark_done: "write",
  send_sms: "write",
  place_call: "write",
} as const satisfies Record<CodeToolName, ToolEffect>;

// La question que posent les deux paragraphes ci-dessus : l'effet de cet outil
// SURVIT-IL à la réponse ? Une lecture s'épuise dans ce qu'elle renvoie ; une
// écriture reste après, ou part vers un tiers.
//
// Fail-closed comme au-dessus : un nom inconnu est traité comme conséquent.
export function isConsequential(name: string): boolean {
  if (!isClassified(name)) return true;
  if (TOOL_POLICY[name] !== "code") return false;
  return CODE_TOOL_EFFECT[name as CodeToolName] === "write";
}

// Par SMS : seules les écritures exigent le code, pour la raison écrite plus
// haut (la réponse ne part qu'au numéro enregistré).
export function requiresVerificationOverSms(name: string): boolean {
  return isConsequential(name);
}

// ——— Le consentement durable posé pour un numéro ———
//
// Deuxième niveau à côté du code jetable : la personne déclare, depuis son
// espace, qu'un de ses numéros vérifiés n'a plus à refaire le code à chaque
// appel. C'est un consentement du registre, donc horodaté et révocable en
// ajoutant une ligne (supabase/migrations/0014).
//
// Ce grant ne peut PAS tout couvrir, et la limite n'est pas un réglage. Le
// caller-ID est usurpable : c'est la raison d'être du code jetable, et un grant
// durable ne la fait pas disparaître. Il ne vaut donc que là où l'effet s'épuise
// dans la réponse, c'est-à-dire exactement sur isConsequential() = false. La
// frontière est la même que celle du canal texte, pour une raison différente,
// mais elle répond à la même question, ce qui est la seule bonne raison de ne
// pas en tenir deux versions.
//
// Ce que le grant NE couvre jamais : créer ou déplacer un rendez-vous, éteindre
// un rappel, envoyer un SMS, passer un appel. Ces cinq-là redemandent le code, à
// chaque appel, grant ou pas — et la lecture AGRÉGÉE ci-dessous avec eux.
//
// ——— La lecture agrégée ———
//
// isConsequential() mesure la PERSISTANCE : l'effet survit-il à la réponse ?
// C'est le bon axe pour le canal texte et pour tout ce qui envoie ou détruit.
// Il ne sait pas répondre à une deuxième question, qui est celle de la PORTÉE :
// combien de choses distinctes cette lecture rend-elle d'un coup ?
//
// get_last_call_summary ne prend AUCUN argument. Il ne relit pas la donnée qu'on
// lui a demandée : il rend le condensé de tout ce qui est passé dans l'appel
// précédent — un créneau d'agenda, le numéro d'un contact, une note relue, une
// adresse prononcée, et par-dessus la parole libre. Un seul appel sans code rend
// donc l'union de ce que trois lectures protégées séparément auraient donné,
// sans que personne ait eu à formuler la moindre question.
//
// D'où l'exclusion. Le caller-ID est usurpable : c'est la raison d'être du code
// jetable, et le grant durable accepte ce risque là où la lecture est bornée par
// une question posée. Il ne l'accepte pas sur un agrégat non interrogé.
//
// On ne le reclasse PAS en "write" pour obtenir le même effet : ce serait faux
// (rien ne persiste après la réponse) et isConsequential() sert ailleurs, à
// commencer par le canal texte, où le résumé reste une lecture ordinaire.
const AGGREGATE_READS = ["get_last_call_summary"] as const satisfies readonly ToolName[];

// Cette lecture rend-elle d'un coup l'union de plusieurs lectures protégées ?
// Si oui, aucun grant durable ne la couvre : seul le code jetable l'ouvre.
export function isAggregateRead(name: string): boolean {
  return (AGGREGATE_READS as readonly string[]).includes(name);
}

export type GateContext = {
  channel: "voice" | "text";
  verified: boolean; // code jetable (ou PIN, par texte) validé sur ce tour
  trustedCaller: boolean; // grant durable en cours pour CE numéro
};

// La décision de gate, en un seul endroit : ce tour doit-il refuser cet outil
// faute de code ? index.ts ne fait plus que l'appeler, et gate.test.ts la couvre
// dans les deux sens.
export function toolNeedsCode(name: string, ctx: GateContext): boolean {
  const gated = ctx.channel === "text" ? requiresVerificationOverSms(name) : requiresVerification(name);
  if (!gated) return false;
  if (ctx.verified) return false;
  // Le grant ne rattrape que le non-conséquent, et jamais une lecture agrégée.
  // isConsequential() étant fail-closed, un outil inconnu reste refusé même pour
  // un numéro de confiance.
  return !(ctx.trustedCaller && !isConsequential(name) && !isAggregateRead(name));
}

// Une donnée personnelle peut aussi ENTRER dans un outil libre : l'adresse du
// domicile injectée comme origine d'un itinéraire (voir index.ts). Ce n'est pas
// le gate nominal, mais c'est une lecture, donc le grant vaut là aussi.
export function personalReadsUnlocked(ctx: GateContext): boolean {
  return ctx.verified || ctx.trustedCaller;
}
