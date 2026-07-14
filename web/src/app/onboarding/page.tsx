// Onboarding — « l'unique écran que le client payant touche vraiment » (§5).
// 4 étapes : téléphone (OTP) -> Google -> consentements -> code PIN.

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { saveConsents, skipGoogle } from "./actions";
import { PhoneStep, PinStep } from "./steps";

const STEPS = ["phone", "google", "consents", "pin"] as const;

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
  if (step === "done") redirect("/tableau-de-bord");
  const stepIndex = STEPS.indexOf(step as (typeof STEPS)[number]);

  return (
    <main className="mx-auto min-h-screen max-w-lg px-6 py-12">
      <div className="mb-10 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? "bg-neutral-900 dark:bg-white" : "bg-neutral-200 dark:bg-neutral-800"}`}
          />
        ))}
      </div>

      {step === "phone" && <PhoneStep />}

      {step === "google" && (
        <section>
          <h1 className="text-2xl font-semibold">Connecter l'agenda et les contacts</h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            En connectant ton compte Google, l'assistant pourra lire et gérer tes rendez-vous et
            retrouver tes contacts. Les accès sont chiffrés et révocables à tout moment.
          </p>
          <div className="mt-8 space-y-3">
            <a
              href="/api/oauth/google"
              className="block w-full rounded-lg bg-neutral-900 px-4 py-3 text-center text-lg font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              Connecter mon compte Google
            </a>
            <form action={skipGoogle}>
              <button className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900">
                Passer pour l'instant
              </button>
            </form>
          </div>
        </section>
      )}

      {step === "consents" && (
        <section>
          <h1 className="text-2xl font-semibold">Ce que l'assistant a le droit de faire</h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Chaque autorisation est enregistrée, horodatée et révocable. C'est toi qui décides.
          </p>
          <form action={saveConsents} className="mt-8 space-y-3">
            {[
              ["calendar", "Lire et modifier l'agenda", true],
              ["contacts", "Lire les contacts", true],
              ["sms", "Envoyer des SMS (rappels, itinéraires, comptes-rendus)", true],
              ["outbound_calls", "Passer des appels à ma place (restaurant, taxi, rendez-vous)", true],
              ["memory", "Retenir mes préférences (lieux, personnes, habitudes)", true],
              ["recording", "Enregistrer et transcrire les appels pour le suivi", false],
            ].map(([source, label, def]) => (
              <label
                key={String(source)}
                className="flex items-start gap-3 rounded-xl border border-neutral-200 p-4 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
              >
                <input type="checkbox" name={String(source)} defaultChecked={Boolean(def)} className="mt-1 h-5 w-5" />
                <span>{String(label)}</span>
              </label>
            ))}
            <button className="w-full rounded-lg bg-neutral-900 px-4 py-3 text-lg font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
              Enregistrer mes choix
            </button>
          </form>
        </section>
      )}

      {step === "pin" && <PinStep />}
    </main>
  );
}
