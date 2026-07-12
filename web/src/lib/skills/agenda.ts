// Skill Agenda — Google Calendar (list/create/move).

import { google } from "googleapis";
import { googleFor } from "../google";
import { CallSession, SkillResult, frDate, parisDayBounds } from "./types";

async function calendarFor(session: CallSession) {
  if (!session.userId) return null;
  const auth = await googleFor(session.userId);
  if (!auth) return null;
  return google.calendar({ version: "v3", auth });
}

const NOT_CONNECTED =
  "Le compte Google n'est pas connecté. La personne (ou sa famille) doit le connecter sur le site.";

export async function listEvents(session: CallSession, args: { day: string }): Promise<SkillResult> {
  const cal = await calendarFor(session);
  if (!cal) return NOT_CONNECTED;
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
  if (items.length === 0) return `Aucun rendez-vous le ${label}.`;
  const lines = items.map((e) => {
    const when = e.start?.dateTime ? frDate(e.start.dateTime) : "toute la journée";
    return `- ${e.summary ?? "Sans titre"} : ${when}${e.location ? `, à ${e.location}` : ""}`;
  });
  return `Rendez-vous du ${label} :\n${lines.join("\n")}`;
}

export async function createEvent(
  session: CallSession,
  args: { title: string; start: string; duration_minutes?: number; confirmed: boolean },
): Promise<SkillResult> {
  const cal = await calendarFor(session);
  if (!cal) return NOT_CONNECTED;
  const durationMin = args.duration_minutes ?? 60;
  if (!args.confirmed) {
    return `PROPOSITION (à lire à voix haute puis demander confirmation) : créer le rendez-vous « ${args.title} » le ${frDate(args.start)}, durée ${durationMin} minutes.`;
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
  return `C'est fait : « ${args.title} » est noté le ${frDate(args.start)}.`;
}

export async function moveEvent(
  session: CallSession,
  args: { event_query: string; new_start: string; confirmed: boolean },
): Promise<SkillResult> {
  const cal = await calendarFor(session);
  if (!cal) return NOT_CONNECTED;
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
  if (!ev?.id) return `Je ne trouve pas de rendez-vous correspondant à « ${args.event_query} » dans le mois qui vient.`;
  const oldWhen = ev.start?.dateTime ? frDate(ev.start.dateTime) : "?";
  if (!args.confirmed) {
    return `PROPOSITION : déplacer « ${ev.summary} » (actuellement le ${oldWhen}) au ${frDate(args.new_start)}. Demander confirmation.`;
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
  return `C'est fait : « ${ev.summary} » est déplacé au ${frDate(args.new_start)}.`;
}
