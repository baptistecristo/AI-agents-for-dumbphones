// Tableau de bord : ce que l'assistant a fait (appels, SMS), rappels à venir,
// connexions et consentements. Tout est visible, rien n'est caché.

import { redirect } from "next/navigation";
import { clampVoiceSpeed } from "@/lib/agents/inbound";
import { normalizeLanguage } from "@/lib/language";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { signOut, toggleConsent, updatePersonalization } from "./actions";

export const dynamic = "force-dynamic";

// Débit de parole : des mots, pas des chiffres. « 0,85 » ne veut rien dire pour
// une oreille, et une liste fermée ne peut produire qu'une valeur acceptée par
// ElevenLabs (0.7 – 1.2) — le curseur libre, lui, invite à taper n'importe quoi.
const VOICE_SPEED_CHOICES: { value: number; label: string }[] = [
  { value: 0.7, label: "Lent" },
  { value: 0.85, label: "Posé" },
  { value: 1.0, label: "Normal" },
  { value: 1.1, label: "Vif" },
  { value: 1.2, label: "Rapide" },
];

// Un profil peut porter un débit absent de la liste (ancien défaut, valeur
// écrite en base) : on présélectionne l'option la plus proche, sinon le
// formulaire afficherait « Lent » et l'enregistrement ralentirait l'agent sans
// que personne ne l'ait demandé.
function nearestVoiceSpeed(stored: unknown): number {
  const speed = clampVoiceSpeed(stored);
  return VOICE_SPEED_CHOICES.reduce((best, choice) =>
    Math.abs(choice.value - speed) < Math.abs(best.value - speed) ? choice : best,
  ).value;
}

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
          ⚠️ Connecte ton compte Google pour activer l'agenda et les contacts →
        </a>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">Derniers appels</h2>
        <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {(calls ?? []).length === 0 && <p className="p-4 text-sm text-neutral-500">Aucun appel pour l'instant. Appelle ton numéro pour essayer !</p>}
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
          <h2 className="mb-3 text-lg font-medium">Missions (appels passés à ta place)</h2>
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
          C&apos;est ici que se règle l&apos;agent : comment il t&apos;appelle au téléphone, la langue et le
          débit de sa voix, et l&apos;adresse utilisée quand tu dis « chez moi ».
        </p>
        <form
          action={updatePersonalization}
          className="space-y-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Comment l&apos;agent doit t&apos;appeler</span>
            <input
              name="preferred_name"
              defaultValue={profile?.preferred_name ?? ""}
              placeholder="Ex. : Sam, Camille…"
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
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Langue de l&apos;agent</span>
            <select
              name="preferred_language"
              defaultValue={normalizeLanguage(profile?.preferred_language)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
            <span className="mt-1 block text-neutral-500">
              La langue dans laquelle l&apos;agent décroche. Il suit quand même si tu changes de langue
              en cours d&apos;appel.
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Débit de parole</span>
            <select
              name="voice_speed"
              defaultValue={nearestVoiceSpeed(profile?.voice_speed)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            >
              {VOICE_SPEED_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-neutral-500">
              La vitesse à laquelle l&apos;agent te parle. Ça ne change rien aux appels qu&apos;il passe
              à ta place.
            </span>
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
        Tes données restent en Europe. Export et suppression du compte : écris-nous (droit à l'effacement, RGPD).
      </footer>
    </main>
  );
}
