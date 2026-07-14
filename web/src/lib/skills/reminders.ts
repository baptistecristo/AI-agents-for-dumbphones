// Skill Rappels — stockage interne + envoi par le cron /api/cron/reminders.
// Inclut le rappel vocal « est-ce que j'ai déjà… ? » (did_i_already).

import { supabaseAdmin } from "../supabase/admin";
import { CallSession, SkillResult, formatDate, t } from "./types";

const noUser = (session: CallSession) =>
  t(session, {
    fr: "Je ne peux pas gérer de rappels pour un appelant non identifié.",
    en: "I can't manage reminders for an unidentified caller.",
  });

export async function setReminder(
  session: CallSession,
  args: { text: string; due_at: string; recurrence?: string },
): Promise<SkillResult> {
  if (!session.userId) return noUser(session);
  const recurrence = args.recurrence && args.recurrence !== "none" ? args.recurrence : null;
  const { error } = await supabaseAdmin().from("reminders").insert({
    user_id: session.userId,
    text: args.text,
    due_at: new Date(args.due_at).toISOString(),
    recurrence,
  });
  if (error)
    return t(session, {
      fr: "Désolé, je n'ai pas réussi à enregistrer ce rappel.",
      en: "Sorry, I couldn't save that reminder.",
    });
  return t(session, {
    fr: `Rappel enregistré : « ${args.text} », ${formatDate(args.due_at, session.language)}${recurrence ? `, répété (${recurrence})` : ""}. Il arrivera par SMS.`,
    en: `Reminder saved: "${args.text}", ${formatDate(args.due_at, session.language)}${recurrence ? `, repeating (${recurrence})` : ""}. It will arrive by SMS.`,
  });
}

export async function listReminders(session: CallSession): Promise<SkillResult> {
  if (!session.userId) return noUser(session);
  const { data } = await supabaseAdmin()
    .from("reminders")
    .select("text, due_at, recurrence")
    .eq("user_id", session.userId)
    .eq("status", "pending")
    .order("due_at", { ascending: true })
    .limit(8);
  if (!data || data.length === 0)
    return t(session, { fr: "Aucun rappel à venir.", en: "No upcoming reminders." });
  const lines = data.map(
    (r) =>
      `- ${r.text} : ${r.due_at ? formatDate(r.due_at, session.language) : t(session, { fr: "sans date", en: "no date" })}`,
  );
  return t(session, {
    fr: `Rappels à venir :\n${lines.join("\n")}`,
    en: `Upcoming reminders:\n${lines.join("\n")}`,
  });
}

export async function didIAlready(session: CallSession, args: { what: string }): Promise<SkillResult> {
  if (!session.userId) return noUser(session);
  const todayStart = new Date();
  todayStart.setHours(todayStart.getHours() - 24);
  const { data } = await supabaseAdmin()
    .from("reminders")
    .select("text, done_at")
    .eq("user_id", session.userId)
    .not("done_at", "is", null)
    .gte("done_at", todayStart.toISOString())
    .ilike("text", `%${args.what.split(" ").slice(-1)[0]}%`)
    .order("done_at", { ascending: false })
    .limit(1);
  if (data && data.length > 0) {
    return t(session, {
      fr: `Oui : « ${data[0].text} » a été marqué fait ${formatDate(data[0].done_at!, session.language)}.`,
      en: `Yes: "${data[0].text}" was marked done ${formatDate(data[0].done_at!, session.language)}.`,
    });
  }
  return t(session, {
    fr: `Je n'ai aucune trace que « ${args.what} » ait été fait ces dernières 24 heures. (Ce n'est fiable que si la personne me le signale à chaque fois.)`,
    en: `I have no record of "${args.what}" being done in the last 24 hours. (This is only reliable if the person tells me each time.)`,
  });
}

export async function markDone(session: CallSession, args: { what: string }): Promise<SkillResult> {
  if (!session.userId) return noUser(session);
  const now = new Date().toISOString();
  // Marque le rappel en attente correspondant, sinon crée une trace "fait".
  const { data } = await supabaseAdmin()
    .from("reminders")
    .select("id, text")
    .eq("user_id", session.userId)
    .in("status", ["pending", "sent"])
    .ilike("text", `%${args.what.split(" ").slice(-1)[0]}%`)
    .limit(1);
  if (data && data.length > 0) {
    await supabaseAdmin().from("reminders").update({ status: "done", done_at: now }).eq("id", data[0].id);
    return t(session, {
      fr: `Noté : « ${data[0].text} » est fait.`,
      en: `Noted: "${data[0].text}" is done.`,
    });
  }
  await supabaseAdmin().from("reminders").insert({
    user_id: session.userId,
    text: args.what,
    status: "done",
    done_at: now,
  });
  return t(session, {
    fr: `Noté : « ${args.what} » est fait. Je m'en souviendrai si on me repose la question.`,
    en: `Noted: "${args.what}" is done. I'll remember it if you ask me again.`,
  });
}
