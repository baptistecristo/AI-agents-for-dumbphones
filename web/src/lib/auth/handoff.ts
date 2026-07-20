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

// Ce qui SIGNE un retour d'auth : un justificatif à échanger, ou l'erreur que
// Supabase renvoie à sa place. Tout le reste (utm_*, etc.) est du trafic normal
// sur la vitrine : on ne veut surtout pas le rediriger.
const TRIGGERS = ["code", "token_hash", "error", "error_code"] as const;

// Transmis avec un déclencheur, jamais seuls. `type` ne dit rien sans son
// `token_hash` : Supabase ne l'envoie jamais isolé, alors qu'un lien de la
// vitrine peut très bien porter /?type=annual. Le prendre pour un retour d'auth
// expédierait le visiteur sur /auth/callback sans justificatif, donc sur
// /connexion?erreur=lien. Même raison pour error_description, qui suit `error`.
// Mais /auth/callback a besoin de `type` pour son verifyOtp : on le reporte.
const COMPANIONS = ["type", "error_description"] as const;

export function authHandoff(params: Record<string, string | undefined>): string | null {
  if (!TRIGGERS.some((key) => params[key])) return null;

  const forwarded = new URLSearchParams();
  for (const key of [...TRIGGERS, ...COMPANIONS]) {
    if (params[key]) forwarded.set(key, params[key]!);
  }
  // Le repli Site URL perd le `next` : on redonne la destination par défaut.
  // La valeur n'est pas validée ici — safeNext s'en charge dans /auth/callback,
  // et dupliquer l'anti-open-redirect ferait deux règles à garder d'accord.
  forwarded.set("next", params.next ?? "/onboarding");
  return `/auth/callback?${forwarded}`;
}
