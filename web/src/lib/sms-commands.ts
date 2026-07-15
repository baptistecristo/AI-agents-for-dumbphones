// Routeur de commandes SMS — inspiré de Sift (github.com/edleeman17/sift, MIT),
// le "compagnon dumbphone" : en plus de la voix, l'utilisateur peut piloter
// l'assistant par mots-clés SMS. Moins cher qu'une minute vocale, et utilisable
// quand parler est difficile. Réutilise exactement les mêmes skills que la voix.
//
// Commandes : AIDE · METEO [ville] [demain] · AGENDA [demain] ·
// RAPPEL <heure> <texte> [demain] · RAPPELS · FAIT <texte> · ROUTE <destination>
//
// Volontairement absents par SMS : envoi de SMS à des tiers et appels sortants
// (actions protégées : elles exigent le code jetable en appel, que le canal SMS
// ne sait pas gérer). Les commandes SMS de lecture (AGENDA, RAPPELS) restent sur
// l'identité de l'expéditeur — validée par la signature Twilio — sans code : le
// gate `verify_code` ne couvre que le canal vocal (voir la note de périmètre).

import { listEvents } from "./skills/agenda";
import { getDirections } from "./skills/directions";
import { didIAlready, listReminders, markDone, setReminder } from "./skills/reminders";
import { CallSession, t } from "./skills/types";
import { getWeather } from "./skills/weather";
import { supabaseAdmin } from "./supabase/admin";

const getHelp = (session: CallSession) => t(session, {
  fr: `Commandes SMS :\nMETEO [ville] [demain]\nAGENDA [demain]\nRAPPEL 18h30 prendre médicament [demain]\nRAPPELS (liste)\nFAIT <quoi> (marquer fait)\nDEJA <quoi> (est-ce fait ?)\nROUTE <destination>\nOu appelez-moi, tout simplement 📞`,
  en: `SMS Commands:\nWEATHER [city] [tomorrow]\nAGENDA [tomorrow]\nREMIND 18:30 take medication [tomorrow]\nREMINDERS (list)\nDONE <what> (mark done)\nALREADY <what> (is it done?)\nROUTE <destination>\nOr simply call me 📞`
});

// Construit une date Europe/Paris pour aujourd'hui/demain à HH:MM
function parisDateAt(hour: number, minute: number, dayOffset: number): Date {
  const now = new Date();
  // Décalage réel Paris<->UTC à l'instant t (gère été/hiver)
  const parisNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const offsetMs = parisNow.getTime() - now.getTime();
  const target = new Date(now.getTime() + offsetMs);
  target.setDate(target.getDate() + dayOffset);
  target.setHours(hour, minute, 0, 0);
  const utc = new Date(target.getTime() - offsetMs);
  // Heure déjà passée aujourd'hui sans jour précisé -> demain
  if (dayOffset === 0 && utc.getTime() < now.getTime()) {
    return new Date(utc.getTime() + 24 * 3600_000);
  }
  return utc;
}

function parseTime(word: string): { hour: number; minute: number } | null {
  const m = word.match(/^(\d{1,2})(?:[h:](\d{2})?)?(am|pm)?$/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3]?.toLowerCase();
  
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export async function handleSmsCommand(session: CallSession, body: string): Promise<string> {
  const text = body.trim();
  const upper = text.toUpperCase();
  const [keyword, ...rest] = text.split(/\s+/);
  const args = rest.join(" ").trim();

  if (!session.userId) {
    return t(session, {
      fr: "Bonjour ! Ce numéro est celui d'un assistant vocal personnel. Inscription (avec l'aide d'un proche) sur le site.",
      en: "Hello! This number belongs to a personal voice assistant. Registration (with the help of a relative) is on the website."
    });
  }

  const k = keyword.toUpperCase().replace(/[ÉÈÊ]/g, "E");

  if (["AIDE", "HELP", "?"].includes(k)) {
    return getHelp(session);
  }

  if (["METEO", "WEATHER"].includes(k)) {
    const isTomorrow = /\b(DEMAIN|TOMORROW)\b/i.test(args);
    const city = args.replace(/\b(demain|tomorrow)\b/gi, "").trim() || undefined;
    return await getWeather(session, { city, day: isTomorrow ? "tomorrow" : "today" }, await homeCity(session));
  }

  if (["AGENDA", "SCHEDULE"].includes(k)) {
    const isTomorrow = /\b(DEMAIN|TOMORROW)\b/i.test(args);
    return await listEvents(session, { day: isTomorrow ? "tomorrow" : "today" });
  }

  if (["RAPPEL", "REMIND", "REMINDER"].includes(k)) {
    const tomorrow = /\b(demain|tomorrow)\b/i.test(args);
    const words = args.replace(/\b(demain|tomorrow)\b/gi, "").trim().split(/\s+/);
    let time = parseTime(words[0]);
    let reminderText = words.slice(1).join(" ");
    if (!time && words.length > 1) {
      time = parseTime(words[words.length - 1]);
      reminderText = words.slice(0, -1).join(" ");
    }
    if (!time || !reminderText) {
      return t(session, {
        fr: "Format : RAPPEL 18h30 prendre médicament (ajoutez « demain » si besoin)",
        en: "Format: REMIND 18:30 take medication (add 'tomorrow' if needed)"
      });
    }
    const due = parisDateAt(time.hour, time.minute, tomorrow ? 1 : 0);
    return await setReminder(session, { text: reminderText, due_at: due.toISOString() });
  }

  if (["RAPPELS", "REMINDERS"].includes(k)) {
    return await listReminders(session);
  }

  if (["FAIT", "DONE"].includes(k)) {
    if (!args) return t(session, { fr: "Format : FAIT prendre médicament", en: "Format: DONE take medication" });
    return await markDone(session, { what: args });
  }

  if (["DEJA", "ALREADY"].includes(k)) {
    if (!args) return t(session, { fr: "Format : DEJA pris médicament", en: "Format: ALREADY took medication" });
    return await didIAlready(session, { what: args });
  }

  if (["ROUTE", "ITINERAIRE", "DIRECTIONS"].includes(k)) {
    if (!args) return t(session, { fr: "Format : ROUTE 12 rue de la Paix, Paris", en: "Format: ROUTE 12 rue de la Paix, Paris" });
    return await getDirections(session, { destination: args }, await homeAddress(session));
  }

  if (k === "STOP") {
      await supabaseAdmin().from("consents").insert({
        user_id: session.userId,
        source: "sms",
        granted: false,
        scope_note: "STOP reçu par SMS",
      });
      return t(session, { 
        fr: "C'est noté, plus aucun SMS non sollicité. Répondez START pour réactiver.",
        en: "Noted, no more unsolicited SMS. Reply START to reactivate."
      });
  }

  if (k === "START") {
      await supabaseAdmin().from("consents").insert({
        user_id: session.userId,
        source: "sms",
        granted: true,
        scope_note: "START reçu par SMS",
      });
      return t(session, { fr: "Les SMS sont réactivés ✅", en: "SMS are reactivated ✅" });
  }

  if (/m[ée]t[ée]o/i.test(upper) || /weather/i.test(upper)) {
    return await getWeather(session, {}, await homeCity(session));
  }

  return t(session, {
    fr: `Je n'ai pas compris « ${keyword} ». Envoyez AIDE pour la liste des commandes, ou appelez-moi 📞`,
    en: `I didn't understand "${keyword}". Send HELP for the list of commands, or call me 📞`
  });
}

async function homeAddress(session: CallSession): Promise<string | null> {
  const { data } = await supabaseAdmin().from("profiles").select("home_address").eq("id", session.userId!).single();
  return data?.home_address ?? null;
}

async function homeCity(session: CallSession): Promise<string | null> {
  const addr = await homeAddress(session);
  if (!addr) return null;
  // Dernière composante de l'adresse = la ville, la plupart du temps
  const parts = addr.split(",").map((p) => p.trim().replace(/^\d{5}\s*/, ""));
  return parts[parts.length - 1] || null;
}
