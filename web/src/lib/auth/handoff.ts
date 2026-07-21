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

// Le code PKCE est un UUID : GoTrue le tire de son flow_state, et
// @supabase/auth-js documente exchangeCodeForSession sur
// '34e770dd-9ff9-416c-87fa-43b31d7ef225'. On exige cette forme avant de
// détourner qui que ce soit, parce que `code` est un nom de paramètre banal :
// parrainage, promo, affiliation. Sans ce filtre, /?code=SUMMER25 partait vers
// /auth/callback, où l'échange échouait, et le visiteur atterrissait sur
// /connexion?erreur=lien sans avoir rien demandé. N'importe quel numéro de
// version d'UUID passe : c'est la forme qui sépare un justificatif d'un code
// promo, pas le nibble de version.
const PKCE_CODE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ce qui SIGNE un retour d'auth : un justificatif à échanger, ou l'erreur que
// Supabase renvoie à sa place. Tout le reste (utm_*, etc.) est du trafic normal
// sur la vitrine : on ne veut surtout pas le rediriger. Chaque déclencheur dit
// à quoi ressemble une valeur crédible ; l'opaque (token_hash) et les énumérés
// (error, error_code) se contentent d'être présents.
const TRIGGERS = {
  code: (value: string) => PKCE_CODE.test(value),
  token_hash: () => true,
  error: () => true,
  error_code: () => true,
} satisfies Record<string, (value: string) => boolean>;

type TriggerKey = keyof typeof TRIGGERS;
const TRIGGER_KEYS = Object.keys(TRIGGERS) as TriggerKey[];

// Transmis avec un déclencheur, jamais seuls. `type` ne dit rien sans son
// `token_hash` : Supabase ne l'envoie jamais isolé, alors qu'un lien de la
// vitrine peut très bien porter /?type=annual. Le prendre pour un retour d'auth
// expédierait le visiteur sur /auth/callback sans justificatif, donc sur
// /connexion?erreur=lien. Même raison pour error_description, qui suit `error`.
// Mais /auth/callback a besoin de `type` pour son verifyOtp : on le reporte.
const COMPANIONS = ["type", "error_description"] as const;

// Next rend `?a=1&a=2` sous forme de tableau. Supabase ne répète jamais un
// paramètre de retour d'auth : une valeur répétée n'est donc pas un retour
// d'auth crédible, et choisir laquelle garder serait une devinette qu'un lien
// forgé pourrait orienter. On la laisse tomber, la vitrine s'affiche.
function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function authHandoff(
  params: Record<string, string | string[] | undefined>,
): string | null {
  // Un déclencheur ne compte que si sa valeur tient la route. Le même verdict
  // sert à déclencher et à reporter : un `code` non crédible qui voyagerait
  // avec un token_hash valide ferait échouer l'échange côté /auth/callback,
  // qui essaie le code en premier.
  const credible = (key: TriggerKey): string | undefined => {
    const value = single(params[key]);
    return value !== undefined && TRIGGERS[key](value) ? value : undefined;
  };

  if (!TRIGGER_KEYS.some((key) => credible(key) !== undefined)) return null;

  const forwarded = new URLSearchParams();
  for (const key of TRIGGER_KEYS) {
    const value = credible(key);
    if (value !== undefined) forwarded.set(key, value);
  }
  for (const key of COMPANIONS) {
    const value = single(params[key]);
    if (value !== undefined) forwarded.set(key, value);
  }
  // Le repli Site URL perd le `next` : on redonne la destination par défaut.
  // La valeur n'est pas validée ici — safeNext s'en charge dans /auth/callback,
  // et dupliquer l'anti-open-redirect ferait deux règles à garder d'accord.
  forwarded.set("next", single(params.next) ?? "/onboarding");
  return `/auth/callback?${forwarded}`;
}
