// Coque de l'espace personnel : garde d'accès (une fois), en-tête, navigation,
// pied de page. Chaque page de section rend son contenu dans {children} et
// refait sa propre lecture (défense en profondeur, comme le reste du code).

import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { signOut } from "./actions";
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

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-6 dark:border-neutral-800">
        <div>
          <Link href="/" className="font-display text-xl text-ink hover:text-bleu dark:text-neutral-50 dark:hover:text-bulle">
            {brand}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-ink dark:text-neutral-50">
            Bonjour {profile?.preferred_name || "👋"}
          </h1>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
            {phone ? `Téléphone relié : ${phone}` : "Aucun téléphone relié"}
            {google ? ` · Google : ${google.google_email}` : " · Google non connecté"}
          </p>
        </div>
        <form action={signOut}>
          <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-ink hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bleu dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-900">
            Se déconnecter
          </button>
        </form>
      </header>

      <div className="md:grid md:grid-cols-[13rem_1fr] md:gap-10">
        <div className="mb-6 md:mb-0">
          <div className="md:sticky md:top-8">
            <PersonalAreaNav />
          </div>
        </div>
        <main className="min-w-0">{children}</main>
      </div>

      <footer className="mt-14 border-t border-neutral-200 pt-6 text-xs text-neutral-400 dark:border-neutral-800">
        Tes données restent en Europe, chiffrées. Tu peux les exporter ou supprimer ton compte
        depuis <Link href="/tableau-de-bord/compte" className="underline hover:text-bleu">Compte</Link> (droit à l&apos;effacement, RGPD).
      </footer>
    </div>
  );
}
