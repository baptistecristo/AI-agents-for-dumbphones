// Tableau de bord : ce que l'assistant a fait (appels, SMS), rappels à venir,
// connexions et consentements. Lisible par la famille comme par l'utilisateur.

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { signOut, toggleConsent, updatePersonalization } from "./actions";

export const dynamic = "force-dynamic";

const CONSENT_LABELS: Record<string, string> = {
  calendar: "Agenda",
  contacts: "Contacts",
  sms: "SMS",
  outbound_calls: "Appels à ma place",
  memory: "Mémoire des préférences",
  recording: "Enregistrement des appels",
};

function fr(dt: string | null): string {
  if (!dt) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(dt));
}

export default async function DashboardPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const db = supabaseAdmin();
  const [{ data: profile }, { data: phones }, { data: google }, { data: consents }, { data: reminders }, { data: calls }, { data: jobs }] =
    await Promise.all([
      db.from("profiles").select("*").eq("id", user.id).single(),
      db.from("phones").select("e164, verified_at").eq("user_id", user.id),
      db.from("google_connections").select("google_email, connected_at").eq("user_id", user.id).maybeSingle(),
      db.from("current_consents").select("source, granted").eq("user_id", user.id),
      db.from("reminders").select("text, due_at, recurrence").eq("user_id", user.id).eq("status", "pending").order("due_at").limit(10),
      db.from("call_logs").select("direction, agent, summary, started_at, ended_reason").eq("user_id", user.id).order("started_at", { ascending: false }).limit(10),
      db.from("outbound_jobs").select("kind, goal, status, result, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    ]);

  if (profile?.onboarding_step && profile.onboarding_step !== "done") redirect("/onboarding");

  const consentMap = new Map((consents ?? []).map((c) => [c.source, c.granted]));

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Bonjour {profile?.preferred_name || ""} 👋</h1>
          <p className="text-sm text-neutral-500">
            {phones?.[0]?.e164 ? `Téléphone relié : ${phones[0].e164}` : "Aucun téléphone relié"}
            {google ? ` · Google : ${google.google_email}` : " · Google non connecté"}
          </p>
        </div>
        <form action={signOut}>
          <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900">
            Se déconnecter
          </button>
        </form>
      </header>

      {!google && (
        <a
          href="/api/oauth/google"
          className="mb-8 block rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          ⚠️ Connectez le compte Google pour activer l'agenda et les contacts →
        </a>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">Derniers appels</h2>
        <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {(calls ?? []).length === 0 && <p className="p-4 text-sm text-neutral-500">Aucun appel pour l'instant. Appelez le numéro de l'assistant pour essayer !</p>}
          {(calls ?? []).map((c, i) => (
            <div key={i} className="flex items-baseline justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-medium">
                  {c.direction === "inbound" ? "📞 Appel reçu" : `🤖 Mission ${c.agent}`}
                </p>
                <p className="text-sm text-neutral-500">{c.summary ?? "(pas encore de résumé)"}</p>
              </div>
              <span className="shrink-0 text-xs text-neutral-400">{fr(c.started_at)}</span>
            </div>
          ))}
        </div>
      </section>

      {(jobs ?? []).length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-medium">Missions (appels passés à votre place)</h2>
          <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {(jobs ?? []).map((j, i) => (
              <div key={i} className="p-4">
                <p className="text-sm font-medium">
                  {j.kind} — {j.status === "done" ? "✅ fait" : j.status === "failed" ? "❌ échec" : j.status === "calling" ? "📞 en cours" : j.status === "needs_user" ? "⚠️ à voir" : "⏳ en attente"}
                </p>
                <p className="text-sm text-neutral-500">{j.goal}</p>
                {j.result && <p className="mt-1 text-sm">{j.result}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">Rappels à venir</h2>
        <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {(reminders ?? []).length === 0 && <p className="p-4 text-sm text-neutral-500">Aucun rappel programmé.</p>}
          {(reminders ?? []).map((r, i) => (
            <div key={i} className="flex items-baseline justify-between gap-4 p-4">
              <p className="text-sm">{r.text}{r.recurrence ? ` · ${r.recurrence}` : ""}</p>
              <span className="shrink-0 text-xs text-neutral-400">{fr(r.due_at)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">Personnalisation de l&apos;agent</h2>
        <p className="mb-3 text-sm text-neutral-500">
          C&apos;est ici que se règle l&apos;agent : comment il vous appelle au téléphone, et l&apos;adresse
          utilisée quand vous dites « chez moi ».
        </p>
        <form
          action={updatePersonalization}
          className="space-y-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Comment l&apos;agent doit vous appeler</span>
            <input
              name="preferred_name"
              defaultValue={profile?.preferred_name ?? ""}
              placeholder="Ex. : Madame Martin, Jeanne…"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Adresse de « chez moi » (itinéraires)</span>
            <input
              name="home_address"
              defaultValue={profile?.home_address ?? ""}
              placeholder="Ex. : 12 rue de la Paix, 75002 Paris"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
          <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300">
            Enregistrer
          </button>
        </form>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">Autorisations</h2>
        <p className="mb-3 text-sm text-neutral-500">Chaque changement est enregistré et horodaté (registre de consentements).</p>
        <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {Object.entries(CONSENT_LABELS).map(([source, label]) => {
            const granted = consentMap.get(source) ?? false;
            return (
              <form key={source} action={toggleConsent} className="flex items-center justify-between p-4">
                <input type="hidden" name="source" value={source} />
                <input type="hidden" name="granted" value={granted ? "false" : "true"} />
                <span className="text-sm">{label}</span>
                <button
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    granted
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                      : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                  }`}
                >
                  {granted ? "Autorisé — révoquer" : "Refusé — autoriser"}
                </button>
              </form>
            );
          })}
        </div>
      </section>

      <footer className="text-xs text-neutral-400">
        Vos données restent en Europe. Export et suppression du compte : écrivez-nous (droit à l'effacement, RGPD).
      </footer>
    </main>
  );
}
