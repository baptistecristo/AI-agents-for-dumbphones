// Skill Rappels — stockage interne + envoi par le cron /api/cron/reminders.
// Inclut le rappel vocal « est-ce que j'ai déjà… ? » (did_i_already).

import { supabaseAdmin } from "../supabase/admin";
import { CallSession, SkillResult, frDate } from "./types";

const NO_USER = "Je ne peux pas gérer de rappels pour un appelant non identifié.";

export async function setReminder(
  session: CallSession,
  args: { text: string; due_at: string; recurrence?: string },
): Promise<SkillResult> {
  if (!session.userId) return NO_USER;
  const recurrence = args.recurrence && args.recurrence !== "none" ? args.recurrence : null;
  const { error } = await supabaseAdmin().from("reminders").insert({
    user_id: session.userId,
    text: args.text,
    due_at: new Date(args.due_at).toISOString(),
    recurrence,
  });
  if (error) return "Désolé, je n'ai pas réussi à enregistrer ce rappel.";
  return `Rappel enregistré : « ${args.text} », ${frDate(args.due_at)}${recurrence ? `, répété (${recurrence})` : ""}. Il arrivera par SMS.`;
}

export async function listReminders(session: CallSession): Promise<SkillResult> {
  if (!session.userId) return NO_USER;
  const { data } = await supabaseAdmin()
    .from("reminders")
    .select("text, due_at, recurrence")
    .eq("user_id", session.userId)
    .eq("status", "pending")
    .order("due_at", { ascending: true })
    .limit(8);
  if (!data || data.length === 0) return "Aucun rappel à venir.";
  return `Rappels à venir :\n${data.map((r) => `- ${r.text} : ${r.due_at ? frDate(r.due_at) : "sans date"}`).join("\n")}`;
}

export async function didIAlready(session: CallSession, args: { what: string }): Promise<SkillResult> {
  if (!session.userId) return NO_USER;
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
    return `Oui : « ${data[0].text} » a été marqué fait ${frDate(data[0].done_at!)}.`;
  }
  return `Je n'ai aucune trace que « ${args.what} » ait été fait ces dernières 24 heures. (Ce n'est fiable que si la personne me le signale à chaque fois.)`;
}

export async function markDone(session: CallSession, args: { what: string }): Promise<SkillResult> {
  if (!session.userId) return NO_USER;
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
    return `Noté : « ${data[0].text} » est fait.`;
  }
  await supabaseAdmin().from("reminders").insert({
    user_id: session.userId,
    text: args.what,
    status: "done",
    done_at: now,
  });
  return `Noté : « ${args.what} » est fait. Je m'en souviendrai si on me repose la question.`;
}
