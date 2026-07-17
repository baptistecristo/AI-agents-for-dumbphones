// Landing — la page vitrine. Le héros n'est pas un slogan : c'est un appel
// retranscrit, qui se déroule comme en direct. Le lecteur (quelqu'un qui a
// quitté son smartphone, ou y pense) comprend le produit en écoutant l'appel.
// Les textes vivent dans landing-copy.ts (FR/EN/ES), la langue dans un cookie.

import { LANDING } from "./landing-copy";
import { LangSwitcher } from "./lang-switcher";
import { siteLanguage } from "@/lib/site-i18n";

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? "Agent";

export default async function Home() {
  const lang = await siteLanguage();
  const tr = LANDING[lang];
  return (
    <main className="bg-paper text-ink">
      {/* ---------------------------------------------------------- header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <p className="font-display text-2xl">
          ☎ <span className="ml-1">{brand}</span>
        </p>
        <nav className="flex items-center gap-4">
          <LangSwitcher current={lang} />
          <a href="/telephones" className="hidden rounded-lg px-4 py-2 text-sm font-bold text-bleu underline-offset-4 hover:underline sm:inline">
            {tr.nav.findPhone}
          </a>
          <a href="/connexion" className="rounded-lg px-4 py-2 text-sm font-bold text-bleu underline-offset-4 hover:underline">
            {tr.nav.signIn}
          </a>
          <a
            href="/connexion"
            className="rounded-lg bg-bleu px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-bleu-fonce"
          >
            {tr.nav.createAccount}
          </a>
        </nav>
      </header>

      {/* ------------------------------------------------------------ héros */}
      <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-12 md:grid-cols-2 md:items-center md:pt-20">
        <div>
          <h1 className="font-display text-4xl leading-tight md:text-5xl">
            {tr.hero.titleTop}
            <br />
            <span className="relative inline-block">
              {tr.hero.titleHighlight}
              <span aria-hidden className="absolute inset-x-0 bottom-1 -z-10 h-3 bg-jaune/70" />
            </span>
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-ink/80">
            {tr.hero.lead.replace("%BRAND%", brand)}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="/connexion"
              className="rounded-xl bg-bleu px-6 py-4 text-lg font-bold text-white shadow-md transition hover:bg-bleu-fonce"
            >
              {tr.hero.cta}
            </a>
            <p className="text-sm text-ink/60">
              {tr.hero.readyLine1}
              <br />
              {tr.hero.readyLine2}
            </p>
          </div>
        </div>

        {/* Signature : l'appel qui se déroule en direct */}
        <figure aria-label={tr.call.aria} className="rounded-2xl border border-ink/10 bg-white p-6 shadow-xl shadow-bleu/5">
          <figcaption className="mb-5 flex items-center gap-2 border-b border-ink/10 pb-4 text-sm text-ink/60">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
            {tr.call.caption}
          </figcaption>
          <div className="space-y-3">
            {tr.call.lines.map((line, i) => (
              <p
                key={i}
                className={`call-line max-w-[85%] rounded-2xl px-4 py-2.5 leading-snug ${
                  line.who === "j"
                    ? "bg-bulle text-ink"
                    : "ml-auto bg-bleu text-white"
                }`}
                style={{ animationDelay: `${0.6 + i * 0.9}s` }}
              >
                {line.text}
              </p>
            ))}
          </div>
        </figure>
      </section>

      {/* ----------------------------------------------------- bande jaune */}
      <div className="bg-jaune">
        <p className="mx-auto max-w-6xl px-6 py-4 text-center font-bold tracking-wide text-ink">
          {tr.banner}
        </p>
      </div>

      {/* ---------------------------------------------------- comment ça marche */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-display text-3xl">{tr.how.title}</h2>
        <div className="mt-10 grid gap-10 md:grid-cols-3">
          {tr.how.steps.map((s) => (
            <div key={s.n} className="relative rounded-2xl border border-ink/10 bg-white p-6">
              <span className="font-display absolute -top-5 left-6 flex h-10 w-10 items-center justify-center rounded-full bg-jaune text-xl">
                {s.n}
              </span>
              <h3 className="mt-4 text-xl font-bold">{s.title}</h3>
              <p className="mt-2 leading-relaxed text-ink/75">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- capacités */}
      <section className="border-y border-ink/10 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-3xl">{tr.capabilities.title}</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {tr.capabilities.items.map((c) => (
              <div key={c.title} className="rounded-2xl bg-paper p-6">
                <p className="text-2xl" aria-hidden>
                  {c.icon}
                </p>
                <h3 className="mt-3 text-lg font-bold">{c.title}</h3>
                <p className="mt-1 leading-relaxed text-ink/75">{c.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-ink/60">
            {tr.capabilities.sms.lead} <span className="font-mono font-bold">{tr.capabilities.sms.kw1}</span>,{" "}
            <span className="font-mono font-bold">{tr.capabilities.sms.kw2}</span> {tr.capabilities.sms.or}{" "}
            <span className="font-mono font-bold">{tr.capabilities.sms.kw3}</span> {tr.capabilities.sms.tail}
          </p>
        </div>
      </section>

      {/* ------------------------------------------------- choisir un téléphone */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-col items-start gap-6 rounded-2xl border border-ink/10 bg-bulle/50 p-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="font-display text-2xl">{tr.phones.title}</h2>
            <p className="mt-2 leading-relaxed text-ink/75">{tr.phones.text}</p>
          </div>
          <a
            href="/telephones"
            className="whitespace-nowrap rounded-xl bg-bleu px-6 py-4 text-lg font-bold text-white shadow-md transition hover:bg-bleu-fonce"
          >
            {tr.phones.cta}
          </a>
        </div>
      </section>

      {/* ----------------------------------------------------------- confiance */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-display text-3xl">{tr.trust.title}</h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {tr.trust.items.map((item) => (
            <div key={item.title}>
              <h3 className="text-lg font-bold">{item.title}</h3>
              <p className="mt-2 leading-relaxed text-ink/75">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- CTA final */}
      <section className="bg-bleu">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center">
          <h2 className="font-display text-3xl text-white">{tr.finalCta.title}</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/80">{tr.finalCta.text}</p>
          <a
            href="/connexion"
            className="mt-8 inline-block rounded-xl bg-jaune px-8 py-4 text-lg font-bold text-ink shadow-lg transition hover:brightness-105"
          >
            {tr.finalCta.button}
          </a>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-ink/60">
        <p>
          ☎ {brand} — {tr.footer.tagline}
        </p>
        <p>{tr.footer.made}</p>
      </footer>
    </main>
  );
}
