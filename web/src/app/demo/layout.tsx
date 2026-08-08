// Coque de la démo : la même que l'espace personnel, sans garde d'accès — la
// route est publique et ne lit que des fixtures. Le bandeau au-dessus de
// l'en-tête annonce la fiction avant tout le reste ; la seule action qui mène
// quelque part est « créer mon compte ».

import type { ReactNode } from "react";
import Link from "next/link";
import { siteLanguage } from "@/lib/site-i18n";
import { Button } from "@/components/button";
import { LangSwitcher } from "../lang-switcher";
import { DASHBOARD } from "../tableau-de-bord/copy";
import { PersonalAreaNav } from "../tableau-de-bord/nav";
import { DEMO_COPY } from "./copy";
import { demoData } from "./fixtures";

export const dynamic = "force-dynamic";

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? "Agent";

export default async function DemoLayout({ children }: { children: ReactNode }) {
  const lang = await siteLanguage();
  const tr = DASHBOARD[lang].layout;
  const demo = DEMO_COPY[lang];
  const data = demoData(lang, new Date());

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:px-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-card border-l-2 border-clay bg-clay-tint px-4 py-3">
        <p className="min-w-0 max-w-prose flex-1 basis-64 text-sm leading-relaxed text-ink">
          <span className="mr-2 inline-block rounded-full bg-clay px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-cream">
            {demo.banner.tag}
          </span>
          {demo.banner.body}
        </p>
        <Button href="/connexion" className="shrink-0">{demo.banner.cta}</Button>
      </div>

      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <Link href="/" className="font-display text-xl text-ink transition-colors hover:text-clay">
            {brand}
          </Link>
          <h1 className="mt-1 font-display text-2xl text-ink">
            {tr.greeting} {data.profile.preferred_name}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {tr.phoneLinked.replace("%s", data.phone.e164)}
            {tr.googleConnected.replace("%s", data.google.google_email)}
          </p>
        </div>
        <LangSwitcher current={lang} />
      </header>

      <div className="md:grid md:grid-cols-[13rem_1fr] md:gap-10">
        <div className="mb-6 md:mb-0">
          <div className="md:sticky md:top-8">
            <PersonalAreaNav lang={lang} basePath="/demo" />
          </div>
        </div>
        <main className="min-w-0">{children}</main>
      </div>

      <footer className="mt-14 border-t border-line pt-6 text-xs text-muted">
        {tr.footerBefore}
        <Link href="/demo/compte" className="underline transition-colors hover:text-clay">{tr.footerLink}</Link>
        {tr.footerAfter}
      </footer>
    </div>
  );
}
