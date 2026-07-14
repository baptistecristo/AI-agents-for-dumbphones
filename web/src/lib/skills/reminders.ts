// Skill Rappels — stockage interne + envoi par le cron /api/cron/reminders.
// Inclut le rappel vocal « est-ce que j'ai déjà… ? » (did_i_already).

import { supabaseAdmin } from "../supabase/admin";
import { CallSession, localizedText, SkillResult, frDate } from "./types";

export async function setReminder(
  session: CallSession,
  args: { text: string; due_at: string; recurrence?: string },
): Promise<SkillResult> {
  if (!session.userId) {
    return localizedText(session.language, "Je ne peux pas gérer de rappels pour un appelant non identifié.", "I can't manage reminders for an unidentified caller.");
  }
  const recurrence = args.recurrence && args.recurrence !== "none" ? args.recurrence : null;
  const { error } = await supabaseAdmin().from("reminders").insert({
    user_id: session.userId,
    text: args.text,
    due_at: new Date(args.due_at).toISOString(),
    recurrence,
  });
  if (error) {
    return localizedText(session.language, "Désolé, je n'ai pas réussi à enregistrer ce rappel.", "Sorry, I could not save this reminder.");
  }
  return localizedText(
    session.language,
    `Rappel enregistré : « ${args.text} », ${frDate(args.due_at, session.language)}${recurrence ? `, répété (${recurrence})` : ""}. Il arrivera par SMS.`,
    `Reminder saved: “${args.text}”, ${frDate(args.due_at, session.language)}${recurrence ? `, repeated (${recurrence})` : ""}. It will arrive by SMS.`,
  );
}

export async function listReminders(session: CallSession): Promise<SkillResult> {
  if (!session.userId) {
    return localizedText(session.language, "Je ne peux pas gérer de rappels pour un appelant non identifié.", "I can't manage reminders for an unidentified caller.");
  }
  const { data } = await supabaseAdmin()
    .from("reminders")
    .select("text, due_at, recurrence")
    .eq("user_id", session.userId)
    .eq("status", "pending")
    .order("due_at", { ascending: true })
    .limit(8);
  if (!data || data.length === 0) {
    return localizedText(session.language, "Aucun rappel à venir.", "No reminders coming up.");
  }
  return localizedText(
    session.language,
    `Rappels à venir :\n${data.map((r) => `- ${r.text} : ${r.due_at ? frDate(r.due_at, session.language) : "sans date"}`).join("\n")}`,
    `Upcoming reminders :\n${data.map((r) => `- ${r.text} : ${r.due_at ? frDate(r.due_at, session.language) : "no date"}`).join("\n")}`,
  );
}

export async function didIAlready(session: CallSession, args: { what: string }): Promise<SkillResult> {
  if (!session.userId) {
    return localizedText(session.language, "Je ne peux pas gérer de rappels pour un appelant non identifié.", "I can't manage reminders for an unidentified caller.");
  }
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
    return localizedText(
      session.language,
      `Oui : « ${data[0].text} » a été marqué fait ${frDate(data[0].done_at!, session.language)}.`,
      `Yes: “${data[0].text}” was marked done ${frDate(data[0].done_at!, session.language)}.`,
    );
  }
  return localizedText(
    session.language,
    `Je n'ai aucune trace que « ${args.what} » ait été fait ces dernières 24 heures. (Ce n'est fiable que si la personne me le signale à chaque fois.)`,
    `I have no record that “${args.what}” was done in the last 24 hours. (This is only reliable if the person tells me each time.)`,
  );
}

export async function markDone(session: CallSession, args: { what: string }): Promise<SkillResult> {
  if (!session.userId) {
    return localizedText(session.language, "Je ne peux pas gérer de rappels pour un appelant non identifié.", "I can't manage reminders for an unidentified caller.");
  }
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
    return localizedText(session.language, `Noté : « ${data[0].text} » est fait.`, `Marked: “${data[0].text}” is done.`);
  }
  await supabaseAdmin().from("reminders").insert({
    user_id: session.userId,
    text: args.what,
    status: "done",
    done_at: now,
  });
  return localizedText(
    session.language,
    `Noté : « ${args.what} » est fait. Je m'en souviendrai si on me repose la question.`,
    `Marked: “${args.what}” is done. I will remember it if you ask me again.`,
  );
}
