// Skill Agenda — Google Calendar (list/create/move).

import { google } from "googleapis";
import { googleFor } from "../google";
import { CallSession, SkillResult, formatDate, parisDayBounds, t } from "./types";

async function calendarFor(session: CallSession) {
  if (!session.userId) return null;
  const auth = await googleFor(session.userId);
  if (!auth) return null;
  return google.calendar({ version: "v3", auth });
}

const notConnected = (session: CallSession) =>
  t(session, {
    fr: "Le compte Google n'est pas connecté. Il faut le connecter sur le site.",
    en: "The Google account isn't connected. It needs to be connected on the website.",
    es: "La cuenta de Google no está conectada. Hay que conectarla en la web.",
  });

export async function listEvents(session: CallSession, args: { day: string }): Promise<SkillResult> {
  const cal = await calendarFor(session);
  if (!cal) return notConnected(session);
  const { start, end, label } = parisDayBounds(args.day);
  const res = await cal.events.list({
    calendarId: "primary",
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 10,
  });
  const items = res.data.items ?? [];
  if (items.length === 0)
    return t(session, { fr: `Aucun rendez-vous le ${label}.`, en: `No events on ${label}.`, es: `Ninguna cita el ${label}.` });
  const lines = items.map((e) => {
    const when = e.start?.dateTime
      ? formatDate(e.start.dateTime, session.language)
      : t(session, { fr: "toute la journée", en: "all day", es: "todo el día" });
    return `- ${e.summary ?? t(session, { fr: "Sans titre", en: "Untitled", es: "Sin título" })} : ${when}${e.location ? t(session, { fr: `, à ${e.location}`, en: `, at ${e.location}`, es: `, en ${e.location}` }) : ""}`;
  });
  return t(session, {
    fr: `Rendez-vous du ${label} :\n${lines.join("\n")}`,
    en: `Events on ${label}:\n${lines.join("\n")}`,
    es: `Citas del ${label}:\n${lines.join("\n")}`,
  });
}

export async function createEvent(
  session: CallSession,
  args: { title: string; start: string; duration_minutes?: number; confirmed: boolean },
): Promise<SkillResult> {
  const cal = await calendarFor(session);
  if (!cal) return notConnected(session);
  const durationMin = args.duration_minutes ?? 60;
  if (!args.confirmed) {
    return t(session, {
      fr: `PROPOSITION (à lire à voix haute puis demander confirmation) : créer le rendez-vous « ${args.title} » le ${formatDate(args.start, session.language)}, durée ${durationMin} minutes.`,
      en: `PROPOSAL (read out loud, then ask for confirmation): create the event "${args.title}" on ${formatDate(args.start, session.language)}, duration ${durationMin} minutes.`,
      es: `PROPUESTA (leer en voz alta y pedir confirmación): crear la cita «${args.title}» el ${formatDate(args.start, session.language)}, duración ${durationMin} minutos.`,
    });
  }
  const startDate = new Date(args.start);
  const endDate = new Date(startDate.getTime() + durationMin * 60_000);
  await cal.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: args.title,
      start: { dateTime: startDate.toISOString(), timeZone: "Europe/Paris" },
      end: { dateTime: endDate.toISOString(), timeZone: "Europe/Paris" },
    },
  });
  return t(session, {
    fr: `C'est fait : « ${args.title} » est noté le ${formatDate(args.start, session.language)}.`,
    en: `Done: "${args.title}" is booked on ${formatDate(args.start, session.language)}.`,
    es: `Hecho: «${args.title}» queda anotado el ${formatDate(args.start, session.language)}.`,
  });
}

export async function moveEvent(
  session: CallSession,
  args: { event_query: string; new_start: string; confirmed: boolean },
): Promise<SkillResult> {
  const cal = await calendarFor(session);
  if (!cal) return notConnected(session);
  // Cherche l'évènement dans les 30 prochains jours
  const now = new Date();
  const res = await cal.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + 30 * 24 * 3600_000).toISOString(),
    q: args.event_query,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 3,
  });
  const ev = (res.data.items ?? [])[0];
  if (!ev?.id)
    return t(session, {
      fr: `Je ne trouve pas de rendez-vous correspondant à « ${args.event_query} » dans le mois qui vient.`,
      en: `I can't find an event matching "${args.event_query}" in the coming month.`,
      es: `No encuentro ninguna cita que coincida con «${args.event_query}» en el próximo mes.`,
    });
  const oldWhen = ev.start?.dateTime ? formatDate(ev.start.dateTime, session.language) : "?";
  if (!args.confirmed) {
    return t(session, {
      fr: `PROPOSITION : déplacer « ${ev.summary} » (actuellement le ${oldWhen}) au ${formatDate(args.new_start, session.language)}. Demander confirmation.`,
      en: `PROPOSAL: move "${ev.summary}" (currently on ${oldWhen}) to ${formatDate(args.new_start, session.language)}. Ask for confirmation.`,
      es: `PROPUESTA: mover «${ev.summary}» (ahora el ${oldWhen}) al ${formatDate(args.new_start, session.language)}. Pedir confirmación.`,
    });
  }
  const oldStart = ev.start?.dateTime ? new Date(ev.start.dateTime) : new Date(args.new_start);
  const oldEnd = ev.end?.dateTime ? new Date(ev.end.dateTime) : new Date(oldStart.getTime() + 3600_000);
  const durMs = oldEnd.getTime() - oldStart.getTime();
  const newStart = new Date(args.new_start);
  await cal.events.patch({
    calendarId: "primary",
    eventId: ev.id,
    requestBody: {
      start: { dateTime: newStart.toISOString(), timeZone: "Europe/Paris" },
      end: { dateTime: new Date(newStart.getTime() + durMs).toISOString(), timeZone: "Europe/Paris" },
    },
  });
  return t(session, {
    fr: `C'est fait : « ${ev.summary} » est déplacé au ${formatDate(args.new_start, session.language)}.`,
    en: `Done: "${ev.summary}" is moved to ${formatDate(args.new_start, session.language)}.`,
    es: `Hecho: «${ev.summary}» queda movido al ${formatDate(args.new_start, session.language)}.`,
  });
}
