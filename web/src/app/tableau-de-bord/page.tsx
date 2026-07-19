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

// Puce d'état : la couleur remplace l'émoji. ok = fait, argile = en cours,
// ambre = à voir/échec, muet = en attente/neutre.
const STATUS_DOT: Record<string, string> = {
  done: "bg-ok",
  failed: "bg-warn",
  calling: "bg-clay",
  needs_user: "bg-warn",
  pending: "bg-muted",
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
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/tableau-de-bord/agent" className="text-sm font-medium text-clay underline-offset-2 hover:underline">
              {tr.tuneAgent}
            </Link>
            <Link href="/tableau-de-bord/memoire" className="text-sm font-medium text-clay underline-offset-2 hover:underline">
              {tr.manageMemory}
            </Link>
          </div>
        </Card>
      </Section>

      <Section title={tr.callsTitle}>
        {(calls ?? []).length === 0 ? (
          <EmptyState>{tr.callsEmpty}</EmptyState>
        ) : (
          <Card className="divide-y divide-line !p-0">
            {(calls ?? []).map((c, i) => (
              <div key={i} className="flex items-baseline justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {c.direction === "inbound" ? (
                      <>
                        <Dot className="bg-ok" />
                        {tr.inboundCall}
                      </>
                    ) : (
                      <>
                        <Dot className="bg-clay" />
                        {tr.mission.replace("%s", c.agent)}
                      </>
                    )}
                  </p>
                  <p className="truncate text-sm text-muted">{c.summary ?? tr.noSummary}</p>
                </div>
                <span className="shrink-0 text-xs text-muted">{fr(c.started_at, lang)}</span>
              </div>
            ))}
          </Card>
        )}
      </Section>

      {(jobs ?? []).length > 0 && (
        <Section title={tr.jobsTitle}>
          <Card className="divide-y divide-line !p-0">
            {(jobs ?? []).map((j, i) => (
              <div key={i} className="p-4">
                <p className="text-sm font-medium text-ink">
                  {j.kind} —{" "}
                  <Dot className={STATUS_DOT[j.status] ?? "bg-muted"} />
                  {tr.jobStatus[j.status as keyof typeof tr.jobStatus] ?? j.status}
                </p>
                <p className="text-sm text-muted">{j.goal}</p>
                {j.result && <p className="mt-1 text-sm text-ink">{j.result}</p>}
              </div>
            ))}
          </Card>
        </Section>
      )}

      <Section title={tr.remindersTitle}>
        {(reminders ?? []).length === 0 ? (
          <EmptyState>
            {tr.remindersEmpty}<Link href="/tableau-de-bord/memoire" className="font-medium text-clay underline">{tr.remindersEmptyLink}</Link>
          </EmptyState>
        ) : (
          <Card className="divide-y divide-line !p-0">
            {(reminders ?? []).map((r, i) => (
              <div key={i} className="flex items-baseline justify-between gap-4 p-4">
                <p className="text-sm text-ink">
                  {r.text}
                  {r.recurrence ? <span className="text-muted"> · {r.recurrence}</span> : ""}
                </p>
                <span className="shrink-0 text-xs text-muted">{fr(r.due_at, lang)}</span>
              </div>
            ))}
          </Card>
        )}
      </Section>
    </>
  );
}

// Petite puce colorée : remplace l'émoji d'état par un point discret + le texte.
function Dot({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={`mr-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full align-middle ${className}`}
    />
  );
}

function Glance({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold text-ink">{value}</dd>
    </div>
  );
}
