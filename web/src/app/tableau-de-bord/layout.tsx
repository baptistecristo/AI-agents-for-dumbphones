// Coque de l'espace personnel : garde d'accès (une fois), en-tête, navigation,
// pied de page. Chaque page de section rend son contenu dans {children} et
// refait sa propre lecture (défense en profondeur, comme le reste du code).

import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { siteLanguage } from "@/lib/site-i18n";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { Button } from "@/components/button";
import { LangSwitcher } from "../lang-switcher";
import { signOut } from "./actions";
import { DASHBOARD } from "./copy";
import { PersonalAreaNav } from "./nav";

export const dynamic = "force-dynamic";

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? "Agent";

export default async function PersonalAreaLayout({ children }: { children: ReactNode }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const db = supabaseAdmin();
  const [{ data: profile }, { data: phones }, { data: google }] = await Promise.all([
    db.from("profiles").select("preferred_name, onboarding_step").eq("id", user.id).single(),
    db.from("phones").select("e164").eq("user_id", user.id).not("verified_at", "is", null).limit(1),
    db.from("google_connections").select("google_email").eq("user_id", user.id).maybeSingle(),
  ]);

  // La garde d'onboarding vit ici, une fois pour toutes les sous-pages.
  if (profile?.onboarding_step && profile.onboarding_step !== "done") redirect("/onboarding");

  const phone = phones?.[0]?.e164 ?? null;
  const lang = await siteLanguage();
  const tr = DASHBOARD[lang].layout;

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <Link href="/" className="font-display text-xl text-ink transition-colors hover:text-clay">
            {brand}
          </Link>
          <h1 className="mt-1 font-display text-2xl text-ink">
            {tr.greeting}
            {profile?.preferred_name ? ` ${profile.preferred_name}` : ""}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {phone ? tr.phoneLinked.replace("%s", phone) : tr.noPhone}
            {google ? tr.googleConnected.replace("%s", google.google_email) : tr.googleNotConnected}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LangSwitcher current={lang} />
          <form action={signOut}>
            <Button variant="ghost">{tr.signOut}</Button>
          </form>
        </div>
      </header>

      <div className="md:grid md:grid-cols-[13rem_1fr] md:gap-10">
        <div className="mb-6 md:mb-0">
          <div className="md:sticky md:top-8">
            <PersonalAreaNav lang={lang} />
          </div>
        </div>
        <main className="min-w-0">{children}</main>
      </div>

      <footer className="mt-14 border-t border-line pt-6 text-xs text-muted">
        {tr.footerBefore}
        <Link href="/tableau-de-bord/compte" className="underline transition-colors hover:text-clay">{tr.footerLink}</Link>
        {tr.footerAfter}
      </footer>
    </div>
  );
}
