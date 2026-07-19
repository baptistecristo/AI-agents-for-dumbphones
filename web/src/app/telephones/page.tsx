// La page vitrine du comparateur. Coquille serveur (métadonnées SEO + intro
// statique), qui rend le composant client interactif <Finder/>. La langue du
// site (cookie) sert de langue de départ ; la bascule du comparateur reste
// locale à la page.

import type { Metadata } from "next";
import Link from "next/link";
import { Language } from "@/lib/language";
import { siteLanguage } from "@/lib/site-i18n";
import { Wordmark } from "@/components/brand";
import { SiteFooter } from "@/components/site-footer";
import Finder from "./finder";

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? "Agent";

const META: Record<Language, { title: string; description: string }> = {
  fr: {
    title: `Trouve ton téléphone simple — ${brand}`,
    description:
      "Comparateur de téléphones simples (dumbphones) avec filtres : région, navigation (Google Maps ou GPS de localisation), vrai téléphone simple ou smartphone simplifié, format et prix. Europe, Amérique du Nord et international.",
  },
  en: {
    title: `Find your dumbphone — ${brand}`,
    description:
      "Dumbphone comparator with filters: region, navigation (Google Maps or location-only GPS), true dumbphone or simplified smartphone, form factor and price. Europe, North America and worldwide.",
  },
  es: {
    title: `Encuentra tu teléfono básico — ${brand}`,
    description:
      "Comparador de teléfonos básicos (dumbphones) con filtros: región, navegación (Google Maps o GPS de localización), teléfono básico de verdad o smartphone simplificado, formato y precio. Europa, Norteamérica e internacional.",
  },
};

const SHELL: Record<Language, { signIn: string; tagline: string; back: string }> = {
  fr: { signIn: "Se connecter", tagline: "l'assistant qu'on appelle, tout simplement.", back: "← Retour à l'accueil" },
  en: { signIn: "Sign in", tagline: "the assistant you just call.", back: "← Back to the home page" },
  es: { signIn: "Iniciar sesión", tagline: "el asistente al que simplemente llamas.", back: "← Volver al inicio" },
};

export async function generateMetadata(): Promise<Metadata> {
  return META[await siteLanguage()];
}

export default async function TelephonesPage() {
  const lang = await siteLanguage();
  const tr = SHELL[lang];
  return (
    <main className="text-slate">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Wordmark />
        <a
          href="/connexion"
          className="text-sm font-medium text-ink transition-colors hover:text-clay"
        >
          {tr.signIn}
        </a>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-20 pt-4">
        <Finder initialLang={lang} />
      </section>

      <SiteFooter
        tagline={tr.tagline}
        right={
          <Link href="/" className="font-medium text-clay transition-colors hover:text-ink">
            {tr.back}
          </Link>
        }
      />
    </main>
  );
}
