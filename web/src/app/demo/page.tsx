// Aperçu de la démo : le miroir exact de l'aperçu réel, nourri par les
// fixtures. Même JSX, mêmes libellés (copy.ts du tableau de bord) ; seules les
// requêtes ont disparu et les liens internes restent dans /demo.

import Link from "next/link";
import { siteLanguage } from "@/lib/site-i18n";
import { DASHBOARD } from "../tableau-de-bord/copy";
import { fr, languageLabel, voiceSpeedLabel } from "../tableau-de-bord/format";
import { Card, PageIntro, Section } from "../tableau-de-bord/ui";
import { demoData } from "./fixtures";

export const dynamic = "force-dynamic";

// Puce d'état : même code couleur que l'aperçu réel.
const STATUS_DOT: Record<string, string> = {
  done: "bg-ok",
  failed: "bg-warn",
  calling: "bg-clay",
  needs_user: "bg-warn",
  pending: "bg-muted",
};

export default async function DemoOverviewPage() {
  const lang = await siteLanguage();
  const tr = DASHBOARD[lang].overview;
  const recurrenceLabels = DASHBOARD[lang].memoire.recurrence;
  const { profile, calls, jobs, reminders, notes } = demoData(lang, new Date());

  return (
    <>
      <PageIntro eyebrow={tr.eyebrow} title={tr.title}>
        {tr.intro}
      </PageIntro>

      <Section title={tr.glanceTitle}>
        <Card>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            <Glance label={tr.language} value={languageLabel(profile.preferred_language)} />
            <Glance label={tr.speed} value={voiceSpeedLabel(profile.voice_speed, lang)} />
            <Glance label={tr.homeAddress} value={tr.homeSet} />
            <Glance label={tr.memoryNotes} value={String(notes.length)} />
          </dl>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/demo/agent" className="text-sm font-medium text-clay underline-offset-2 hover:underline">
              {tr.tuneAgent}
            </Link>
            <Link href="/demo/memoire" className="text-sm font-medium text-clay underline-offset-2 hover:underline">
              {tr.manageMemory}
            </Link>
          </div>
        </Card>
      </Section>

      <Section title={tr.callsTitle}>
        <Card className="divide-y divide-line !p-0">
          {calls.map((c, i) => (
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
                <p className="truncate text-sm text-muted">{c.summary}</p>
              </div>
              <span className="shrink-0 text-xs text-muted">{fr(c.started_at, lang)}</span>
            </div>
          ))}
        </Card>
      </Section>

      <Section title={tr.jobsTitle}>
        <Card className="divide-y divide-line !p-0">
          {jobs.map((j, i) => (
            <div key={i} className="p-4">
              <p className="text-sm font-medium text-ink">
                {j.kind} —{" "}
                <Dot className={STATUS_DOT[j.status] ?? "bg-muted"} />
                {tr.jobStatus[j.status]}
              </p>
              <p className="text-sm text-muted">{j.goal}</p>
              {j.result && <p className="mt-1 text-sm text-ink">{j.result}</p>}
            </div>
          ))}
        </Card>
      </Section>

      <Section title={tr.remindersTitle}>
        <Card className="divide-y divide-line !p-0">
          {reminders.slice(0, 5).map((r, i) => (
            <div key={i} className="flex items-baseline justify-between gap-4 p-4">
              <p className="text-sm text-ink">
                {r.text}
                {r.recurrence ? <span className="text-muted"> · {recurrenceLabels[r.recurrence]}</span> : ""}
              </p>
              <span className="shrink-0 text-xs text-muted">{fr(r.due_at, lang)}</span>
            </div>
          ))}
        </Card>
      </Section>
    </>
  );
}

// Petite puce colorée, identique à celle de l'aperçu réel.
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
