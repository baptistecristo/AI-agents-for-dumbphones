// Garde de configuration au démarrage du serveur (#51).
//
// Next.js appelle register() une fois par instance serveur, avant de servir la
// première requête. On ne valide que sur le runtime Node — jamais sur Edge (qui
// n'a qu'un sous-ensemble de l'environnement) ni pendant `next build`. Une
// configuration cassée (variable requise manquante, malformée, ou restée à sa
// valeur d'exemple) fait échouer le démarrage avec un message lisible, plutôt
// que de laisser l'erreur surgir plus tard au fond d'un appel.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { assertBootConfig } = await import("./lib/config");
  assertBootConfig();
}
