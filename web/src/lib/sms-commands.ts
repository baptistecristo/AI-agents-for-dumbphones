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
import { CallSession } from "./skills/types";
import { getWeather } from "./skills/weather";
import { supabaseAdmin } from "./supabase/admin";

const HELP = `Commandes SMS :
METEO [ville] [demain]
AGENDA [demain]
RAPPEL 18h30 prendre médicament [demain]
RAPPELS (liste)
FAIT <quoi> (marquer fait)
DEJA <quoi> (est-ce fait ?)
ROUTE <destination>
Ou appelez-moi, tout simplement 📞`;

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
  const m = word.match(/^(\d{1,2})(?:[h:](\d{2})?)?$/i);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export async function handleSmsCommand(session: CallSession, body: string): Promise<string> {
  const text = body.trim();
  const upper = text.toUpperCase();
  const [keyword, ...rest] = text.split(/\s+/);
  const args = rest.join(" ").trim();

  if (!session.userId) {
    return "Bonjour ! Ce numéro est celui d'un assistant vocal personnel. Inscription (avec l'aide d'un proche) sur le site.";
  }

  switch (keyword.toUpperCase().replace(/[ÉÈÊ]/g, "E")) {
    case "AIDE":
    case "HELP":
    case "?":
      return HELP;

    case "METEO": {
      const tomorrow = /\bDEMAIN\b/i.test(args);
      const city = args.replace(/\bdemain\b/gi, "").trim() || undefined;
      return await getWeather(session, { city, day: tomorrow ? "tomorrow" : "today" }, await homeCity(session));
    }

    case "AGENDA": {
      const day = /\bDEMAIN\b/i.test(args) ? "tomorrow" : "today";
      return await listEvents(session, { day });
    }

    case "RAPPEL": {
      const tomorrow = /\bdemain\b/i.test(args);
      const words = args.replace(/\bdemain\b/gi, "").trim().split(/\s+/);
      // L'heure peut être le premier ou le dernier mot : "RAPPEL 18h30 médicament" / "RAPPEL médicament 18h30"
      let time = parseTime(words[0]);
      let reminderText = words.slice(1).join(" ");
      if (!time && words.length > 1) {
        time = parseTime(words[words.length - 1]);
        reminderText = words.slice(0, -1).join(" ");
      }
      if (!time || !reminderText) {
        return "Format : RAPPEL 18h30 prendre médicament (ajoutez « demain » si besoin)";
      }
      const due = parisDateAt(time.hour, time.minute, tomorrow ? 1 : 0);
      return await setReminder(session, { text: reminderText, due_at: due.toISOString() });
    }

    case "RAPPELS":
      return await listReminders(session);

    case "FAIT":
      if (!args) return "Format : FAIT prendre médicament";
      return await markDone(session, { what: args });

    case "DEJA":
      if (!args) return "Format : DEJA pris médicament";
      return await didIAlready(session, { what: args });

    case "ROUTE":
    case "ITINERAIRE":
      if (!args) return "Format : ROUTE 12 rue de la Paix, Paris";
      return await getDirections(session, { destination: args }, await homeAddress(session));

    case "STOP":
      // Opt-out : trace en consentements (obligation FR/GDPR)
      await supabaseAdmin().from("consents").insert({
        user_id: session.userId,
        source: "sms",
        granted: false,
        scope_note: "STOP reçu par SMS",
      });
      return "C'est noté, plus aucun SMS non sollicité. Répondez START pour réactiver.";

    case "START":
      await supabaseAdmin().from("consents").insert({
        user_id: session.userId,
        source: "sms",
        granted: true,
        scope_note: "START reçu par SMS",
      });
      return "Les SMS sont réactivés ✅";

    default:
      // Question météo/agenda en langage naturel simple ? On oriente gentiment.
      if (/m[ée]t[ée]o/i.test(upper)) return await getWeather(session, {}, await homeCity(session));
      return `Je n'ai pas compris « ${keyword} ». Envoyez AIDE pour la liste des commandes, ou appelez-moi 📞`;
  }
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
