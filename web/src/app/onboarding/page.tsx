// Onboarding — « l'unique écran que le client payant touche vraiment » (§5).
// 3 étapes : téléphone (OTP) -> Google -> consentements.
// (Plus de code PIN à choisir : l'auth en appel se fait par code jetable SMS.)

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { siteLanguage } from "@/lib/site-i18n";
import { LangSwitcher } from "../lang-switcher";
import { saveConsents, skipGoogle } from "./actions";
import { CONSENT_SOURCES, ONBOARDING } from "./copy";
import { PhoneStep } from "./steps";

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
  const step = profile?.onboarding_step ?? "phone";
  // "pin" est un état hérité (l'étape a été retirée) : on le traite comme terminé.
  if (step === "done" || step === "pin") redirect("/tableau-de-bord");
  const stepIndex = STEPS.indexOf(step as (typeof STEPS)[number]);
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
            className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? "bg-neutral-900 dark:bg-white" : "bg-neutral-200 dark:bg-neutral-800"}`}
          />
        ))}
      </div>

      {step === "phone" && <PhoneStep lang={lang} />}

      {step === "google" && (
        <section>
          <h1 className="text-2xl font-semibold">{tr.google.title}</h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">{tr.google.body}</p>
          <div className="mt-8 space-y-3">
            <a
              href="/api/oauth/google"
              className="block w-full rounded-lg bg-neutral-900 px-4 py-3 text-center text-lg font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {tr.google.connect}
            </a>
            <form action={skipGoogle}>
              <button className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900">
                {tr.google.skip}
              </button>
            </form>
          </div>
        </section>
      )}

      {step === "consents" && (
        <section>
          <h1 className="text-2xl font-semibold">{tr.consents.title}</h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">{tr.consents.body}</p>
          <form action={saveConsents} className="mt-8 space-y-3">
            {CONSENT_SOURCES.map((source) => (
              <label
                key={source}
                className="flex items-start gap-3 rounded-xl border border-neutral-200 p-4 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
              >
                <input type="checkbox" name={source} defaultChecked={tr.consents.defaults[source]} className="mt-1 h-5 w-5" />
                <span>{tr.consents.labels[source]}</span>
              </label>
            ))}
            <button className="w-full rounded-lg bg-neutral-900 px-4 py-3 text-lg font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
              {tr.consents.save}
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
