// Décision de routage du proxy, isolée du reste (aucun import Next ni Supabase)
// pour rester testable seule — comme safeNext. Deux règles, à partir du chemin
// demandé et de la présence d'une session :
//   • connecté sur /connexion → inutile de remontrer le formulaire ; on l'envoie
//     vers son espace (l'onboarding réoriente lui-même vers le tableau de bord
//     s'il est terminé) ;
//   • non connecté sur une page privée → retour au formulaire de connexion.
// null = laisser passer.

export type RouteAction = { redirect: string } | null;

export function routeGuard(pathname: string, hasUser: boolean): RouteAction {
  const isPrivate =
    pathname.startsWith("/tableau-de-bord") || pathname.startsWith("/onboarding");
  if (hasUser && pathname === "/connexion") return { redirect: "/onboarding" };
  if (!hasUser && isPrivate) return { redirect: "/connexion" };
  return null;
}
