// Onboarding terminé ou non — un seul verdict, partagé par les deux gardes.
//
// /onboarding renvoie vers /tableau-de-bord quand c'est fini ; la coque du
// tableau de bord renvoie vers /onboarding quand ça ne l'est pas. Les deux
// jugeaient chacune de leur côté, et elles n'étaient pas d'accord sur 'pin' :
// /onboarding le traitait comme terminé, le tableau de bord comme en cours.
// Un profil resté sur cet état hérité rebondissait donc indéfiniment entre les
// deux pages. Tant que les deux lisent ces fonctions, la boucle est impossible.
//
// 'pin' : l'étape « choisir un code » a été retirée (l'auth en appel se fait par
// code jetable SMS). Des profils peuvent encore porter la valeur en base.
const COMPLETE = new Set(["done", "pin"]);

export function isOnboardingComplete(step: string | null | undefined): boolean {
  return step != null && COMPLETE.has(step);
}

// Les deux gardes, nommées et exportées pour que la symétrie soit vérifiable.
// Elles prennent la valeur BRUTE lue en base (`profile?.onboarding_step`), pas
// une valeur déjà normalisée : c'est ce que les deux pages ont en main, et
// c'est là que les deux divergeaient.
//
// L'absence de valeur (null/undefined) veut dire « pas de ligne profiles » et
// rien d'autre : la colonne est `not null default 'phone'` depuis 0001_init,
// donc un profil existant porte toujours une étape. Un compte sans profil n'a
// évidemment pas fini son onboarding : le tableau de bord n'aurait ni nom, ni
// téléphone, ni consentements à afficher. Les deux gardes le traitent donc
// comme non terminé, ce que /onboarding faisait déjà via son `?? "phone"` et
// que le tableau de bord était seul à lire à l'envers : il laissait entrer un
// compte sans profil.

/** /onboarding : l'utilisateur n'a plus rien à y faire, direction le tableau. */
export function shouldLeaveOnboarding(step: string | null | undefined): boolean {
  return isOnboardingComplete(step);
}

/** Coque du tableau de bord : il reste des étapes, retour à /onboarding. */
export function shouldEnterOnboarding(step: string | null | undefined): boolean {
  return !isOnboardingComplete(step);
}
