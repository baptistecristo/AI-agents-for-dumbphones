// Page d'attente pour une connexion OAuth pas encore activée. Le bouton
// « bientôt » du formulaire renvoie ici (avec ?p=<fournisseur>) au lieu de lancer
// une connexion qui échouerait. Publique : hors du matcher du proxy.

import Link from "next/link";
import { PROVIDERS, type OAuthId } from "../providers";

export default async function BientotPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const p = (await searchParams).p;
  const name = p && p in PROVIDERS ? PROVIDERS[p as OAuthId].name : "Ce service";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16 text-center">
      <p className="text-5xl" aria-hidden="true">
        🚧
      </p>
      <h1 className="mt-4 font-display text-3xl tracking-tight text-ink dark:text-neutral-50">
        {name} arrive bientôt
      </h1>
      <p className="mt-3 text-neutral-600 dark:text-neutral-400">
        Cette connexion n&apos;est pas encore activée. En attendant, connecte-toi par e-mail :
        c&apos;est déjà prêt, et le code à 6 chiffres marche même quand le lien est bloqué.
      </p>
      <Link
        href="/connexion"
        className="mt-8 inline-block rounded-xl bg-bleu px-5 py-3 text-base font-bold text-white transition hover:bg-bleu-fonce"
      >
        Revenir à la connexion
      </Link>
    </main>
  );
}
