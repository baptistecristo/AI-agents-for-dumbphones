// Aperçu : ce que l'agent a fait (appels, missions), les rappels à venir, et
// un coup d'œil sur ses réglages. Le détail se règle dans les autres sections ;
// ici, on voit et on saute au bon endroit.

import { redirect } from "next/navigation";
import Link from "next/link";
import { siteLanguage } from "@/lib/site-i18n";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { DASHBOARD } from "./copy";
import { fr, languageLabel, voiceSpeedLabel } from "./format";
import { Card, EmptyState, PageIntro, Section } from "./ui";

export const dynamic = "force-dynamic";

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

  const lang = await siteLanguage();
  const tr = DASHBOARD[lang].overview;

  return (
    <>
      <PageIntro eyebrow={tr.eyebrow} title={tr.title}>
        {tr.intro}
      </PageIntro>

      <Section title={tr.glanceTitle}>
        <Card>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            <Glance label={tr.language} value={languageLabel(profile?.preferred_language)} />
            <Glance label={tr.speed} value={voiceSpeedLabel(profile?.voice_speed, lang)} />
            <Glance label={tr.homeAddress} value={profile?.home_address ? tr.homeSet : "—"} />
            <Glance label={tr.memoryNotes} value={String(memoryCount ?? 0)} />
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/tableau-de-bord/agent" className="text-sm font-bold text-bleu underline-offset-2 hover:underline dark:text-bulle">
              {tr.tuneAgent}
            </Link>
            <Link href="/tableau-de-bord/memoire" className="text-sm font-bold text-bleu underline-offset-2 hover:underline dark:text-bulle">
              {tr.manageMemory}
            </Link>
          </div>
        </Card>
      </Section>

      <Section title={tr.callsTitle}>
        {(calls ?? []).length === 0 ? (
          <EmptyState>{tr.callsEmpty}</EmptyState>
        ) : (
          <Card className="divide-y divide-neutral-100 !p-0 dark:divide-neutral-800">
            {(calls ?? []).map((c, i) => (
              <div key={i} className="flex items-baseline justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink dark:text-neutral-100">
                    {c.direction === "inbound" ? tr.inboundCall : tr.mission.replace("%s", c.agent)}
                  </p>
                  <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">{c.summary ?? tr.noSummary}</p>
                </div>
                <span className="shrink-0 text-xs text-neutral-400">{fr(c.started_at, lang)}</span>
              </div>
            ))}
          </Card>
        )}
      </Section>

      {(jobs ?? []).length > 0 && (
        <Section title={tr.jobsTitle}>
          <Card className="divide-y divide-neutral-100 !p-0 dark:divide-neutral-800">
            {(jobs ?? []).map((j, i) => (
              <div key={i} className="p-4">
                <p className="text-sm font-bold text-ink dark:text-neutral-100">
                  {j.kind} — {tr.jobStatus[j.status as keyof typeof tr.jobStatus] ?? j.status}
                </p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">{j.goal}</p>
                {j.result && <p className="mt-1 text-sm text-ink dark:text-neutral-200">{j.result}</p>}
              </div>
            ))}
          </Card>
        </Section>
      )}

      <Section title={tr.remindersTitle}>
        {(reminders ?? []).length === 0 ? (
          <EmptyState>
            {tr.remindersEmpty}<Link href="/tableau-de-bord/memoire" className="font-bold text-bleu underline dark:text-bulle">{tr.remindersEmptyLink}</Link>
          </EmptyState>
        ) : (
          <Card className="divide-y divide-neutral-100 !p-0 dark:divide-neutral-800">
            {(reminders ?? []).map((r, i) => (
              <div key={i} className="flex items-baseline justify-between gap-4 p-4">
                <p className="text-sm text-ink dark:text-neutral-100">
                  {r.text}
                  {r.recurrence ? <span className="text-neutral-400"> · {r.recurrence}</span> : ""}
                </p>
                <span className="shrink-0 text-xs text-neutral-400">{fr(r.due_at, lang)}</span>
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
