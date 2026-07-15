// Source unique de vérité : quels outils exigent le code SMS (session.verified).
//
// Protégés = ce dont la fuite fait mal si le caller-ID est usurpé : l'agenda
// (lire, créer, déplacer), les contacts, les notes relues, et tout ce qui engage
// le compte vers l'extérieur — un SMS envoyé ou un appel passé en son nom.
//
// Libres = météo, itinéraire, prise de note, et les rappels (poser, lister,
// marquer fait, « est-ce que j'ai déjà… ? »).
//
// Attention : « get_directions est libre » ne veut PAS dire « l'adresse du
// domicile est libre ». L'outil tourne sans code, mais son origine par défaut
// n'est fournie qu'à un appelant vérifié (voir index.ts) ; sans code il demande
// le point de départ. Certaines données se protègent au niveau de l'argument,
// pas de l'outil — cette liste ne les voit pas.
//
// Les rappels RESTENT des données
// personnelles : c'est un arbitrage assumé, pas un oubli. Exiger un code SMS
// pour « est-ce que j'ai déjà pris mes cachets ? » coûte plus cher que le risque
// couvert, précisément au moment où la fonction sert. Les outils d'auth
// eux-mêmes sont libres, sinon rien ne pourrait jamais se débloquer.
//
// Un outil inconnu est libre par défaut : le gate est une liste d'inclusion des
// outils sensibles connus. Tout NOUVEL outil touchant des données doit être ajouté
// ici explicitement.
const PROTECTED = new Set<string>([
  "list_events",
  "create_event",
  "move_event",
  "find_contact",
  "recall",
  "send_sms",
  "place_call",
]);

export function requiresVerification(name: string): boolean {
  return PROTECTED.has(name);
}
