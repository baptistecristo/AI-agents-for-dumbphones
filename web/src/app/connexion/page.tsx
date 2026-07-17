// Connexion : page serveur. Elle lit l'éventuel ?erreur=lien (lien magique
// expiré ou déjà utilisé, posé par /auth/confirm) et le passe au formulaire.
// Le formulaire reste client (il envoie l'OTP), mais l'état d'erreur vient du
// serveur — pas d'effet qui relit l'URL après coup.

import { siteLanguage } from "@/lib/site-i18n";
import { ConnexionForm } from "./form";

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const linkExpired = (await searchParams).erreur === "lien";
  return <ConnexionForm linkExpired={linkExpired} lang={await siteLanguage()} />;
}
