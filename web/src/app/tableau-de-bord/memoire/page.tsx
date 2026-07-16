// Ma mémoire : les données privées qui nourrissent la mémoire de l'agent. Deux
// blocs — les notes (ce que je retiens et te relis au téléphone, après ton code)
// et les rappels en attente (créés en m'appelant ; ici, tu peux les annuler).
// La page relit tout via supabaseAdmin en scopant sur user.id ; les mutations
// vivent dans actions.ts, les interactions par ligne dans forms.tsx.

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { fr } from "../format";
import { Bubble, Card, EmptyState, Hint, PageIntro, Section, fieldLabel, inputCls, primaryBtn, textareaCls } from "../ui";
import { addMemory } from "./actions";
import { CancelReminderButton, NoteRow } from "./forms";

export const dynamic = "force-dynamic";

// La récurrence, dite avec des mots plutôt qu'un code technique.
const RECURRENCE_LABEL: Record<string, string> = {
  daily: "chaque jour",
  weekly: "chaque semaine",
  monthly: "chaque mois",
};

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

  return (
    <>
      <PageIntro eyebrow="Ma mémoire" title="Ma mémoire">
        Les infos que tu me confies et les rappels que tu m&apos;as demandés. C&apos;est ce que je garde pour toi entre deux appels.
      </PageIntro>

      <Section
        title="Mes notes"
        description="Une info à retenir : un code, une date, une habitude. Un sujet (la clé) et ce dont je dois me souvenir."
      >
        <div className="mb-4">
          <Bubble>
            Ce que tu écris ici, je m&apos;en souviens quand tu m&apos;appelles. Demande-moi « c&apos;est quoi le code du
            garage ? » et je te le lis — mais seulement après ton code. Sans lui, tes notes ne sortent pas.
          </Bubble>
        </div>

        <Card className="mb-4">
          <form action={addMemory} className="space-y-4">
            <label className="block">
              {fieldLabel("Le sujet")}
              <input
                name="key"
                required
                maxLength={80}
                placeholder="Ex. : code du garage"
                className={inputCls}
              />
              <Hint>Le mot-clé pour retrouver la note plus tard. « code du garage », « médecin », « poubelles »…</Hint>
            </label>
            <label className="block">
              {fieldLabel("Ce dont je dois me souvenir")}
              <textarea
                name="value"
                required
                maxLength={500}
                rows={2}
                placeholder="Ex. : 4592, puis dièse. Le bouton est à gauche."
                className={textareaCls}
              />
            </label>
            <button className={primaryBtn}>Ajouter à ma mémoire</button>
          </form>
        </Card>

        {notes.length === 0 ? (
          <EmptyState>
            Tu n&apos;as encore rien noté. Ajoute une info ci-dessus — ou dis-moi « retiens que… » en m&apos;appelant, et
            elle apparaîtra ici.
          </EmptyState>
        ) : (
          <Card className="divide-y divide-neutral-100 !p-0 dark:divide-neutral-800">
            {notes.map((m) => (
              <NoteRow key={m.key} noteKey={m.key} value={m.value} />
            ))}
          </Card>
        )}
      </Section>

      <Section
        title="Mes rappels"
        description="Les rappels en attente. Ils se créent en m'appelant ; ici, tu peux les annuler."
      >
        {pending.length === 0 ? (
          <EmptyState>
            Aucun rappel pour l&apos;instant. Tu en programmes un en m&apos;appelant (« rappelle-moi de… »). Il apparaîtra
            ici, et tu pourras l&apos;annuler.
          </EmptyState>
        ) : (
          <Card className="divide-y divide-neutral-100 !p-0 dark:divide-neutral-800">
            {pending.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="text-sm text-ink dark:text-neutral-100">{r.text}</p>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    {fr(r.due_at)}
                    {r.recurrence ? ` · ${RECURRENCE_LABEL[r.recurrence] ?? r.recurrence}` : ""}
                  </p>
                </div>
                <CancelReminderButton id={r.id} label={r.text} />
              </div>
            ))}
          </Card>
        )}
      </Section>
    </>
  );
}
