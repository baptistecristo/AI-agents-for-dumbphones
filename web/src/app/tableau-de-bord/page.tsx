// Aperçu : ce que l'agent a fait (appels, missions), les rappels à venir, et
// un coup d'œil sur ses réglages. Le détail se règle dans les autres sections ;
// ici, on voit et on saute au bon endroit.

import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { fr, languageLabel, voiceSpeedLabel } from "./format";
import { Card, EmptyState, PageIntro, Section } from "./ui";

export const dynamic = "force-dynamic";

const JOB_STATUS: Record<string, string> = {
  done: "✅ fait",
  failed: "❌ échec",
  calling: "📞 en cours",
  needs_user: "⚠️ à voir",
  pending: "⏳ en attente",
};

export default async function OverviewPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const db = supabaseAdmin();
  const [{ data: profile }, { data: reminders }, { data: calls }, { data: jobs }, { count: memoryCount }] =
    await Promise.all([
      db.from("profiles").select("preferred_language, voice_speed, home_address").eq("id", user.id).single(),
      db.from("reminders").select("text, due_at, recurrence").eq("user_id", user.id).eq("status", "pending").order("due_at").limit(5),
      db.from("call_logs").select("direction, agent, summary, started_at").eq("user_id", user.id).order("started_at", { ascending: false }).limit(8),
      db.from("outbound_jobs").select("kind, goal, status, result").eq("user_id", user.id).order("created_at", { ascending: false }).limit(4),
      db.from("memories").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    ]);

  return (
    <>
      <PageIntro eyebrow="Espace personnel" title="Aperçu">
        Ce que ton agent a fait, et comment il est réglé. Le détail se change dans les autres sections.
      </PageIntro>

      <Section title="Ton agent en un coup d'œil">
        <Card>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            <Glance label="Langue" value={languageLabel(profile?.preferred_language)} />
            <Glance label="Débit" value={voiceSpeedLabel(profile?.voice_speed)} />
            <Glance label="Adresse « chez moi »" value={profile?.home_address ? "définie" : "—"} />
            <Glance label="Notes en mémoire" value={String(memoryCount ?? 0)} />
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/tableau-de-bord/agent" className="text-sm font-bold text-bleu underline-offset-2 hover:underline dark:text-bulle">
              Régler mon agent →
            </Link>
            <Link href="/tableau-de-bord/memoire" className="text-sm font-bold text-bleu underline-offset-2 hover:underline dark:text-bulle">
              Gérer ma mémoire →
            </Link>
          </div>
        </Card>
      </Section>

      <Section title="Derniers appels">
        {(calls ?? []).length === 0 ? (
          <EmptyState>Aucun appel pour l&apos;instant. Appelle ton numéro pour essayer !</EmptyState>
        ) : (
          <Card className="divide-y divide-neutral-100 !p-0 dark:divide-neutral-800">
            {(calls ?? []).map((c, i) => (
              <div key={i} className="flex items-baseline justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink dark:text-neutral-100">
                    {c.direction === "inbound" ? "📞 Appel reçu" : `🤖 Mission ${c.agent}`}
                  </p>
                  <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">{c.summary ?? "(pas encore de résumé)"}</p>
                </div>
                <span className="shrink-0 text-xs text-neutral-400">{fr(c.started_at)}</span>
              </div>
            ))}
          </Card>
        )}
      </Section>

      {(jobs ?? []).length > 0 && (
        <Section title="Missions (appels passés à ta place)">
          <Card className="divide-y divide-neutral-100 !p-0 dark:divide-neutral-800">
            {(jobs ?? []).map((j, i) => (
              <div key={i} className="p-4">
                <p className="text-sm font-bold text-ink dark:text-neutral-100">
                  {j.kind} — {JOB_STATUS[j.status] ?? j.status}
                </p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">{j.goal}</p>
                {j.result && <p className="mt-1 text-sm text-ink dark:text-neutral-200">{j.result}</p>}
              </div>
            ))}
          </Card>
        </Section>
      )}

      <Section title="Rappels à venir">
        {(reminders ?? []).length === 0 ? (
          <EmptyState>
            Aucun rappel programmé. <Link href="/tableau-de-bord/memoire" className="font-bold text-bleu underline dark:text-bulle">En ajouter un →</Link>
          </EmptyState>
        ) : (
          <Card className="divide-y divide-neutral-100 !p-0 dark:divide-neutral-800">
            {(reminders ?? []).map((r, i) => (
              <div key={i} className="flex items-baseline justify-between gap-4 p-4">
                <p className="text-sm text-ink dark:text-neutral-100">
                  {r.text}
                  {r.recurrence ? <span className="text-neutral-400"> · {r.recurrence}</span> : ""}
                </p>
                <span className="shrink-0 text-xs text-neutral-400">{fr(r.due_at)}</span>
              </div>
            ))}
          </Card>
        )}
      </Section>
    </>
  );
}

function Glance({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className="mt-0.5 text-base font-bold text-ink dark:text-neutral-100">{value}</dd>
    </div>
  );
}
