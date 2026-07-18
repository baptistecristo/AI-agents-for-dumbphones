// Ma mémoire : les données privées qui nourrissent la mémoire de l'agent. Deux
// blocs — les notes (ce que je retiens et te relis au téléphone, après ton code)
// et les rappels en attente (créés en m'appelant ; ici, tu peux les annuler).
// La page relit tout via supabaseAdmin en scopant sur user.id ; les mutations
// vivent dans actions.ts, les interactions par ligne dans forms.tsx.

import { redirect } from "next/navigation";
import { siteLanguage } from "@/lib/site-i18n";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { DASHBOARD } from "../copy";
import { fr } from "../format";
import { Bubble, Card, EmptyState, Hint, PageIntro, Section, fieldLabel, inputCls, primaryBtn, textareaCls } from "../ui";
import { addMemory } from "./actions";
import { CancelReminderButton, NoteRow } from "./forms";

export const dynamic = "force-dynamic";

export default async function MemoirePage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const db = supabaseAdmin();
  const [{ data: memories }, { data: reminders }] = await Promise.all([
    db.from("memories").select("key, value").eq("user_id", user.id).order("key", { ascending: true }),
    db
      .from("reminders")
      .select("id, text, due_at, recurrence")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("due_at", { ascending: true }),
  ]);

  const notes = memories ?? [];
  const pending = reminders ?? [];
  const lang = await siteLanguage();
  const tr = DASHBOARD[lang].memoire;

  return (
    <>
      <PageIntro eyebrow={tr.eyebrow} title={tr.title}>
        {tr.intro}
      </PageIntro>

      <Section
        title={tr.notes.title}
        description={tr.notes.description}
      >
        <div className="mb-4">
          <Bubble>{tr.notes.bubble}</Bubble>
        </div>

        <Card className="mb-4">
          <form action={addMemory} className="space-y-4">
            <label className="block">
              {fieldLabel(tr.notes.keyLabel)}
              <input
                name="key"
                required
                maxLength={80}
                placeholder={tr.notes.keyPlaceholder}
                className={inputCls}
              />
              <Hint>{tr.notes.keyHint}</Hint>
            </label>
            <label className="block">
              {fieldLabel(tr.notes.valueLabel)}
              <textarea
                name="value"
                required
                maxLength={500}
                rows={2}
                placeholder={tr.notes.valuePlaceholder}
                className={textareaCls}
              />
            </label>
            <button className={primaryBtn}>{tr.notes.add}</button>
          </form>
        </Card>

        {notes.length === 0 ? (
          <EmptyState>{tr.notes.empty}</EmptyState>
        ) : (
          <Card className="divide-y divide-line !p-0">
            {notes.map((m) => (
              <NoteRow key={m.key} noteKey={m.key} value={m.value} lang={lang} />
            ))}
          </Card>
        )}
      </Section>

      <Section
        title={tr.reminders.title}
        description={tr.reminders.description}
      >
        {pending.length === 0 ? (
          <EmptyState>{tr.reminders.empty}</EmptyState>
        ) : (
          <Card className="divide-y divide-line !p-0">
            {pending.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="text-sm text-ink">{r.text}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {fr(r.due_at, lang)}
                    {r.recurrence ? ` · ${tr.recurrence[r.recurrence as keyof typeof tr.recurrence] ?? r.recurrence}` : ""}
                  </p>
                </div>
                <CancelReminderButton id={r.id} label={r.text} lang={lang} />
              </div>
            ))}
          </Card>
        )}
      </Section>
    </>
  );
}
