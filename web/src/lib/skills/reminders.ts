// Skill Rappels — stockage interne + envoi par le cron /api/cron/reminders.
// Inclut le rappel vocal « est-ce que j'ai déjà… ? » (did_i_already).

import { supabaseAdmin } from "../supabase/admin";
import { smsProviderConfigured } from "../twilio";
import { CallSession, SkillResult, formatDate, t } from "./types";

const noUser = (session: CallSession) =>
  t(session, {
    fr: "Je ne peux pas gérer de rappels pour un appelant non identifié.",
    en: "I can't manage reminders for an unidentified caller.",
    es: "No puedo gestionar recordatorios para una persona no identificada.",
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
      es: "Lo siento, no he podido guardar ese recordatorio.",
    });
  // Le rappel est bien enregistré ; c'est sa LIVRAISON qui dépend du cron, donc
  // d'un fournisseur SMS. Sans fournisseur, « il arrivera par SMS » est une
  // promesse que rien ne tiendra — et un rappel est précisément ce qu'on ne
  // vérifie pas soi-même. On dit ce qui existe : la trace, relisible par
  // list_reminders.
  const delivery = smsProviderConfigured("send")
    ? { fr: " Il arrivera par SMS.", en: " It will arrive by SMS.", es: " Llegará por SMS." }
    : {
        fr: " Mais aucun fournisseur SMS n'est branché ici : ce rappel ne partira PAS par SMS. Dis-le honnêtement — il est gardé, et relisible si on te le redemande.",
        en: " But no SMS provider is connected here: this reminder will NOT be texted. Say so honestly — it is kept, and can be read back if asked.",
        es: " Pero aquí no hay proveedor de SMS conectado: este recordatorio NO llegará por SMS. Dilo honestamente — queda guardado, y se puede releer si te lo piden.",
      };
  return t(session, {
    fr: `Rappel enregistré : « ${args.text} », ${formatDate(args.due_at, session.language)}${recurrence ? `, répété (${recurrence})` : ""}.${delivery.fr}`,
    en: `Reminder saved: "${args.text}", ${formatDate(args.due_at, session.language)}${recurrence ? `, repeating (${recurrence})` : ""}.${delivery.en}`,
    es: `Recordatorio guardado: «${args.text}», ${formatDate(args.due_at, session.language)}${recurrence ? `, repetido (${recurrence})` : ""}.${delivery.es}`,
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
    return t(session, { fr: "Aucun rappel à venir.", en: "No upcoming reminders.", es: "Ningún recordatorio pendiente." });
  const lines = data.map(
    (r) =>
      `- ${r.text} : ${r.due_at ? formatDate(r.due_at, session.language) : t(session, { fr: "sans date", en: "no date", es: "sin fecha" })}`,
  );
  return t(session, {
    fr: `Rappels à venir :\n${lines.join("\n")}`,
    en: `Upcoming reminders:\n${lines.join("\n")}`,
    es: `Recordatorios pendientes:\n${lines.join("\n")}`,
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
      es: `Sí: «${data[0].text}» se marcó como hecho ${formatDate(data[0].done_at!, session.language)}.`,
    });
  }
  return t(session, {
    fr: `Je n'ai aucune trace que « ${args.what} » ait été fait ces dernières 24 heures. (Ce n'est fiable que si la personne me le signale à chaque fois.)`,
    en: `I have no record of "${args.what}" being done in the last 24 hours. (This is only reliable if the person tells me each time.)`,
    es: `No tengo constancia de que «${args.what}» se haya hecho en las últimas 24 horas. (Solo es fiable si la persona me lo dice cada vez.)`,
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
      es: `Anotado: «${data[0].text}» está hecho.`,
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
    es: `Anotado: «${args.what}» está hecho. Lo recordaré si me lo vuelves a preguntar.`,
  });
}
