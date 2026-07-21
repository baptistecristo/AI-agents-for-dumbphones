// Landing — la page vitrine. Le héros n'est pas un slogan : c'est un appel
// retranscrit, qui se déroule comme en direct. Le lecteur (quelqu'un qui a
// quitté son smartphone, ou y pense) comprend le produit en écoutant l'appel.
// Les textes vivent dans landing-copy.ts (FR/EN/ES), la langue dans un cookie.

import { redirect } from "next/navigation";
import { LANDING } from "./landing-copy";
import { LangSwitcher } from "./lang-switcher";
import { authHandoff } from "@/lib/auth/handoff";
import { siteLanguage } from "@/lib/site-i18n";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/button";
import { CallScreen } from "@/components/call-screen";
import { SiteFooter } from "@/components/site-footer";
import { card, chip, sectionTitle } from "@/components/styles";

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? "Agent";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Un lien magique dont le redirect_to a été rabattu sur la Site URL atterrit
  // ici : on le rend à /auth/callback plutôt que d'afficher la vitrine comme si
  // rien ne s'était passé. Lire searchParams ne coûte rien de plus, la page est
  // déjà dynamique (cookie de langue).
  const handoff = authHandoff(await searchParams);
  if (handoff) redirect(handoff);

  const lang = await siteLanguage();
  const tr = LANDING[lang];
  return (
    <main className="text-slate">
      {/* ---------------------------------------------------------- header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
        <Wordmark />
        <nav className="flex items-center gap-3 sm:gap-4">
          <LangSwitcher current={lang} />
          <a
            href="/telephones"
            className="hidden text-sm font-medium text-ink transition-colors hover:text-clay sm:inline"
          >
            {tr.nav.findPhone}
          </a>
          <a
            href="/connexion"
            className="hidden text-sm font-medium text-ink transition-colors hover:text-clay sm:inline"
          >
            {tr.nav.signIn}
          </a>
          <Button href="/connexion">{tr.nav.createAccount}</Button>
        </nav>
      </header>

      {/* ------------------------------------------------------------ héros */}
      <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-24 pt-10 md:grid-cols-2 md:items-center md:pt-16">
        <div>
          <h1 className="font-display text-hero text-ink md:text-6xl">
            {tr.hero.titleTop}
            <br />
            <span className="text-clay">{tr.hero.titleHighlight}</span>
          </h1>
          <p className="mt-7 max-w-md text-lg leading-relaxed text-slate">
            {tr.hero.lead.replace("%BRAND%", brand)}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-5">
            <Button href="/connexion" size="lg">
              {tr.hero.cta}
            </Button>
            <p className="text-sm leading-snug text-muted">
              {tr.hero.readyLine1}
              <br />
              {tr.hero.readyLine2}
            </p>
          </div>
        </div>

        {/* Signature : l'écran d'appel vocal, en direct */}
        <CallScreen
          caption={tr.call.caption}
          lines={tr.call.lines}
          brand={brand}
          ariaLabel={tr.call.aria}
        />
      </section>

      {/* ----------------------------------------------- bande d'affirmation */}
      <div className="border-y border-line bg-cream-deep/50">
        <p className="mx-auto max-w-3xl px-6 py-7 text-center font-display text-lg leading-snug text-ink md:text-xl">
          {tr.banner}
        </p>
      </div>

      {/* ---------------------------------------------------- comment ça marche */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <h2 className={sectionTitle}>{tr.how.title}</h2>
        <div className="mt-12 grid gap-x-10 gap-y-12 md:grid-cols-3">
          {tr.how.steps.map((s) => (
            <div key={s.n} className="border-t border-line pt-5">
              <span className="font-display text-2xl text-clay">{s.n.padStart(2, "0")}</span>
              <h3 className="mt-3 font-display text-xl text-ink">{s.title}</h3>
              <p className="mt-2 leading-relaxed text-slate">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- capacités */}
      <section className="border-t border-line bg-cream-deep/40">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <h2 className={sectionTitle}>
            {tr.capabilities.title}
          </h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tr.capabilities.items.map((c) => (
              <div key={c.title} className={`${card} p-6`}>
                <h3 className="font-display text-lg text-ink">{c.title}</h3>
                <p className="mt-2 leading-relaxed text-slate">{c.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-sm leading-relaxed text-muted">
            {tr.capabilities.sms.lead}{" "}
            <span className={chip}>
              {tr.capabilities.sms.kw1}
            </span>
            ,{" "}
            <span className={chip}>
              {tr.capabilities.sms.kw2}
            </span>{" "}
            {tr.capabilities.sms.or}{" "}
            <span className={chip}>
              {tr.capabilities.sms.kw3}
            </span>{" "}
            {tr.capabilities.sms.tail}
          </p>
        </div>
      </section>

      {/* ------------------------------------------------- choisir un téléphone */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-col items-start gap-6 rounded-panel border border-line bg-surface p-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="font-display text-2xl text-ink">{tr.phones.title}</h2>
            <p className="mt-2 leading-relaxed text-slate">{tr.phones.text}</p>
          </div>
          <Button href="/telephones" variant="ghost" size="lg" className="whitespace-nowrap">
            {tr.phones.cta}
          </Button>
        </div>
      </section>

      {/* ----------------------------------------------------------- confiance */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <h2 className={sectionTitle}>{tr.trust.title}</h2>
          <div className="mt-12 grid gap-x-10 gap-y-10 md:grid-cols-3">
            {tr.trust.items.map((item) => (
              <div key={item.title} className="border-t border-line pt-5">
                <h3 className="font-display text-lg text-ink">{item.title}</h3>
                <p className="mt-2 leading-relaxed text-slate">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- CTA final (sombre) */}
      <section className="bg-ink">
        <div className="mx-auto max-w-6xl px-6 py-24 text-center">
          <h2 className="font-display text-3xl leading-tight text-cream md:text-5xl">
            {tr.finalCta.title}
          </h2>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-cream/70">{tr.finalCta.text}</p>
          <div className="mt-9 flex justify-center">
            <Button href="/connexion" variant="accent" size="lg">
              {tr.finalCta.button}
            </Button>
          </div>
        </div>
      </section>

      <SiteFooter tagline={tr.footer.tagline} right={<p className="text-muted">{tr.footer.made}</p>} />
    </main>
  );
}
