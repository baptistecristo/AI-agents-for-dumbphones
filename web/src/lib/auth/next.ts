// Destination interne après connexion. Isolé du reste (aucun import serveur) pour
// rester testable seul : anti open-redirect, on n'accepte qu'un chemin relatif.
//
// Un caractère de contrôle rejette tout : le parseur d'URL WHATWG ignore
// tabulation et sauts de ligne, donc "/\t/evil.example" passerait les
// startsWith puis se résoudrait en https://evil.example dans new URL().

export function safeNext(raw: string | null): string {
  const next = raw ?? "/onboarding";
  const hasControlChar = [...next].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
  return !hasControlChar && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : "/onboarding";
}
