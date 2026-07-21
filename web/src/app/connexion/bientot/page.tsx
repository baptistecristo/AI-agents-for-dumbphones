// Page d'attente pour une méthode de connexion pas encore en service (OAuth pas
// câblé, ou code e-mail sans SMTP). Les boutons « à fixer » du formulaire
// renvoient ici avec ?p=<méthode>, au lieu de lancer une connexion qui
// échouerait. Publique : hors du matcher du proxy.

import { siteLanguage } from "@/lib/site-i18n";
import { CONNEXION } from "../copy";
import { PROVIDERS, type OAuthId } from "../providers";
import { Button } from "@/components/button";

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
      <h1 className="font-display text-3xl text-ink">{name}</h1>
      <p className="mt-2 text-xs font-semibold uppercase tracking-eyebrow text-muted">
        <span className="mr-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-clay align-middle" aria-hidden />
        {tr.comingSoonBadge}
      </p>
      <p className="mt-4 text-slate">{tr.bientot.body}</p>
      <div className="mt-8 flex justify-center">
        <Button href="/connexion" size="lg">
          {tr.bientot.back}
        </Button>
      </div>
    </main>
  );
}
