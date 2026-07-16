// La page vitrine du comparateur. Coquille serveur (métadonnées SEO + intro
// statique), qui rend le composant client interactif <Finder/>.

import type { Metadata } from "next";
import Link from "next/link";
import Finder from "./finder";

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? "Agent";

export const metadata: Metadata = {
  title: `Trouve ton téléphone simple — ${brand}`,
  description:
    "Comparateur de téléphones simples (dumbphones) avec filtres : région, navigation (Google Maps ou GPS de localisation), vrai téléphone simple ou smartphone simplifié, format et prix. Europe, Amérique du Nord et international.",
};

export default function TelephonesPage() {
  return (
    <main className="bg-paper text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="font-display text-2xl">
          ☎ <span className="ml-1">{brand}</span>
        </Link>
        <a href="/connexion" className="rounded-lg px-4 py-2 text-sm font-bold text-bleu underline-offset-4 hover:underline">
          Se connecter
        </a>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-20 pt-4">
        <Finder />
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-ink/60">
        <p>☎ {brand} — l&rsquo;assistant qu&rsquo;on appelle, tout simplement.</p>
        <Link href="/" className="font-bold text-bleu underline-offset-4 hover:underline">
          ← Retour à l&rsquo;accueil
        </Link>
      </footer>
    </main>
  );
}
