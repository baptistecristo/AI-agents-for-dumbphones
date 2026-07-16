// Destination interne après connexion. Isolé du reste (aucun import serveur) pour
// rester testable seul : anti open-redirect, on n'accepte qu'un chemin relatif.

export function safeNext(raw: string | null): string {
  const next = raw ?? "/onboarding";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : "/onboarding";
}
