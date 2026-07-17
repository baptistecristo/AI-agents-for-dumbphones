// Page d'attente pour une méthode de connexion pas encore en service (OAuth pas
// câblé, ou code e-mail sans SMTP). Les boutons « à fixer » du formulaire
// renvoient ici avec ?p=<méthode>, au lieu de lancer une connexion qui
// échouerait. Publique : hors du matcher du proxy.

import Link from "next/link";
import { siteLanguage } from "@/lib/site-i18n";
import { CONNEXION } from "../copy";
import { PROVIDERS, type OAuthId } from "../providers";

export default async function BientotPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const tr = CONNEXION[await siteLanguage()];
  const p = (await searchParams).p;
  const name =
    p && p in PROVIDERS ? PROVIDERS[p as OAuthId].name : p === "code" ? tr.bientot.codeName : tr.bientot.fallbackName;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16 text-center">
      <p className="text-5xl" aria-hidden="true">
        🚧
      </p>
      <h1 className="mt-4 font-display text-3xl tracking-tight text-ink dark:text-neutral-50">
        {name}
      </h1>
      <p className="mt-1 text-sm font-bold uppercase tracking-wide text-neutral-400">{tr.comingSoonBadge}</p>
      <p className="mt-4 text-neutral-600 dark:text-neutral-400">{tr.bientot.body}</p>
      <Link
        href="/connexion"
        className="mt-8 inline-block rounded-xl bg-bleu px-5 py-3 text-base font-bold text-white transition hover:bg-bleu-fonce"
      >
        {tr.bientot.back}
      </Link>
    </main>
  );
}
