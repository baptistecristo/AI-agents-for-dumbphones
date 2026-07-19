// Onboarding — « l'unique écran que le client payant touche vraiment » (§5).
// 3 étapes : téléphone (OTP) -> Google -> consentements.
// (Plus de code PIN à choisir : l'auth en appel se fait par code jetable SMS.)

import { redirect } from "next/navigation";
import { isOnboardingComplete } from "@/lib/auth/onboarding";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { siteLanguage } from "@/lib/site-i18n";
import { LangSwitcher } from "../lang-switcher";
import { saveConsents, skipGoogle } from "./actions";
import { CONSENT_SOURCES, ONBOARDING } from "./copy";
import { PhoneStep } from "./steps";
import { Button } from "@/components/button";

const STEPS = ["phone", "google", "consents"] as const;

export default async function OnboardingPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: profile } = await supabaseAdmin()
    .from("profiles")
    .select("onboarding_step, preferred_name")
    .eq("id", user.id)
    .single();
  const rawStep = profile?.onboarding_step ?? "phone";
  if (isOnboardingComplete(rawStep)) redirect("/tableau-de-bord");
  // onboarding_step n'a pas de contrainte CHECK : une valeur inattendue (migration
  // future, écriture manuelle) donnerait un stepIndex -1 et un écran vide sans
  // issue. On retombe alors sur la première étape plutôt que sur rien.
  const step = (STEPS as readonly string[]).includes(rawStep)
    ? (rawStep as (typeof STEPS)[number])
    : "phone";
  const stepIndex = STEPS.indexOf(step);
  const lang = await siteLanguage();
  const tr = ONBOARDING[lang];

  return (
    <main className="mx-auto min-h-screen max-w-lg px-6 py-12">
      <div className="mb-6 flex justify-end">
        <LangSwitcher current={lang} />
      </div>
      <div className="mb-10 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? "bg-ink" : "bg-line"}`}
          />
        ))}
      </div>

      {step === "phone" && <PhoneStep lang={lang} />}

      {step === "google" && (
        <section>
          <h1 className="font-display text-2xl text-ink">{tr.google.title}</h1>
          <p className="mt-2 text-slate">{tr.google.body}</p>
          <div className="mt-8 space-y-3">
            <Button href="/api/oauth/google" size="lg" className="w-full">
              {tr.google.connect}
            </Button>
            <form action={skipGoogle}>
              <Button variant="ghost" size="lg" className="w-full">
                {tr.google.skip}
              </Button>
            </form>
          </div>
        </section>
      )}

      {step === "consents" && (
        <section>
          <h1 className="font-display text-2xl text-ink">{tr.consents.title}</h1>
          <p className="mt-2 text-slate">{tr.consents.body}</p>
          <form action={saveConsents} className="mt-8 space-y-3">
            {CONSENT_SOURCES.map((source) => (
              <label
                key={source}
                className="flex items-start gap-3 rounded-xl border border-line p-4 hover:bg-cream-deep"
              >
                <input type="checkbox" name={source} defaultChecked={tr.consents.defaults[source]} className="mt-1 h-5 w-5 accent-clay" />
                <span className="text-slate">{tr.consents.labels[source]}</span>
              </label>
            ))}
            <Button type="submit" size="lg" className="w-full">
              {tr.consents.save}
            </Button>
          </form>
        </section>
      )}
    </main>
  );
}
