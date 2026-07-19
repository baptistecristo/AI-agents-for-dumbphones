// Onboarding terminé ou non — un seul verdict, partagé par les deux gardes.
//
// /onboarding renvoie vers /tableau-de-bord quand c'est fini ; la coque du
// tableau de bord renvoie vers /onboarding quand ça ne l'est pas. Les deux
// jugeaient chacune de leur côté, et elles n'étaient pas d'accord sur 'pin' :
// /onboarding le traitait comme terminé, le tableau de bord comme en cours.
// Un profil resté sur cet état hérité rebondissait donc indéfiniment entre les
// deux pages. Tant que les deux lisent cette fonction, la boucle est impossible.
//
// 'pin' : l'étape « choisir un code » a été retirée (l'auth en appel se fait par
// code jetable SMS). Des profils peuvent encore porter la valeur en base.
const COMPLETE = new Set(["done", "pin"]);

export function isOnboardingComplete(step: string | null | undefined): boolean {
  return step != null && COMPLETE.has(step);
}
