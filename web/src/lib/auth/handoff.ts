// Rattrapage d'un retour d'authentification atterri sur la page d'accueil.
//
// Supabase ne renvoie PAS d'erreur quand l'`emailRedirectTo` demandé n'est pas
// dans l'allow-list du projet : il le remplace silencieusement par la Site URL.
// Le lien magique pointe alors sur la racine du site au lieu de /auth/callback,
// la session n'est jamais ouverte, et le visiteur retombe sur la vitrine sans
// la moindre explication — c'est le bug observé le 19/07 :
//
//   redirect_to=https://…vercel.app/            au lieu de
//   redirect_to=https://…vercel.app/auth/callback?next=/onboarding
//
// L'allow-list se corrige côté tableau de bord Supabase, mais elle se re-cassera
// (chaque URL de préversion Vercel est un nouveau domaine). On rend donc le
// parcours insensible au repli : si un retour d'auth arrive sur la racine, on le
// réexpédie vers /auth/callback, qui sait déjà l'échanger. Une seule logique
// d'authentification, un seul endroit où les cookies de session sont posés.

// Les paramètres qui signent un retour d'auth. Tout le reste (utm_*, etc.) est
// du trafic normal sur la vitrine : on ne veut surtout pas le rediriger.
const AUTH_PARAMS = [
  "code",
  "token_hash",
  "type",
  "error",
  "error_code",
  "error_description",
] as const;

export function authHandoff(params: Record<string, string | undefined>): string | null {
  const present = AUTH_PARAMS.filter((key) => params[key]);
  if (present.length === 0) return null;

  const forwarded = new URLSearchParams();
  for (const key of present) forwarded.set(key, params[key]!);
  // Le repli Site URL perd le `next` : on redonne la destination par défaut.
  // La valeur n'est pas validée ici — safeNext s'en charge dans /auth/callback,
  // et dupliquer l'anti-open-redirect ferait deux règles à garder d'accord.
  forwarded.set("next", params.next ?? "/onboarding");
  return `/auth/callback?${forwarded}`;
}
