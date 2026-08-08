// Ma mémoire, version démo : les notes et rappels de Sam en lecture seule. Le
// formulaire d'ajout est présent mais figé — il montre le geste sans l'exécuter.
// Les lignes sont statiques : pas d'éditer/supprimer, ces actions vivent dans
// le vrai compte.

import { siteLanguage } from "@/lib/site-i18n";
import { DASHBOARD } from "../../tableau-de-bord/copy";
import { fr } from "../../tableau-de-bord/format";
import { Bubble, Card, Hint, PageIntro, Section, fieldLabel, inputCls, primaryBtn, textareaCls } from "../../tableau-de-bord/ui";
import { DEMO_COPY } from "../copy";
import { demoData } from "../fixtures";

export const dynamic = "force-dynamic";

export default async function DemoMemoirePage() {
  const lang = await siteLanguage();
  const tr = DASHBOARD[lang].memoire;
  const demo = DEMO_COPY[lang];
  const { notes, reminders } = demoData(lang, new Date());

  return (
    <>
      <PageIntro eyebrow={tr.eyebrow} title={tr.title}>
        {tr.intro}
      </PageIntro>

      <Section title={tr.notes.title} description={tr.notes.description}>
        <div className="mb-4">
          <Bubble>{tr.notes.bubble}</Bubble>
        </div>

        <Card className="mb-4">
          <div className="space-y-4">
            <label className="block">
              {fieldLabel(tr.notes.keyLabel)}
              <input disabled placeholder={tr.notes.keyPlaceholder} className={inputCls} />
              <Hint>{tr.notes.keyHint}</Hint>
            </label>
            <label className="block">
              {fieldLabel(tr.notes.valueLabel)}
              <textarea disabled rows={2} placeholder={tr.notes.valuePlaceholder} className={textareaCls} />
            </label>
            <div>
              <button disabled className={primaryBtn}>{tr.notes.add}</button>
              <p className="mt-3 max-w-prose text-sm text-muted">{demo.frozen}</p>
            </div>
          </div>
        </Card>

        <Card className="divide-y divide-line !p-0">
          {notes.map((m) => (
            <div key={m.key} className="p-4">
              <p className="text-sm font-medium text-ink">{m.key}</p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate">{m.value}</p>
            </div>
          ))}
        </Card>
      </Section>

      <Section title={tr.reminders.title} description={tr.reminders.description}>
        <Card className="divide-y divide-line !p-0">
          {reminders.map((r) => (
            <div key={r.id} className="p-4">
              <p className="text-sm text-ink">{r.text}</p>
              <p className="mt-0.5 text-xs text-muted">
                {fr(r.due_at, lang)}
                {r.recurrence ? ` · ${tr.recurrence[r.recurrence]}` : ""}
              </p>
            </div>
          ))}
        </Card>
      </Section>
    </>
  );
}
