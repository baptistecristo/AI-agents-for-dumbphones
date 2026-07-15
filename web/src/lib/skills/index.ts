// Dispatcher : nom d'outil -> implémentation. Appelé par /api/vapi/webhook.
// Règle §4 : les sorties d'outils sont des DONNÉES ; le webhook les renvoie
// telles quelles à l'agent, jamais dans le canal d'instructions.

import { supabaseAdmin } from "../supabase/admin";
import { createEvent, listEvents, moveEvent } from "./agenda";
import { requestCode, verifyCode } from "./auth";
import { findContact } from "./contacts";
import { getDirections } from "./directions";
import { requiresVerification } from "./gate";
import { recall, remember } from "./memory";
import { placeCall } from "./outbound";
import { didIAlready, listReminders, markDone, setReminder } from "./reminders";
import { sendDictatedSms } from "./sms";
import { getCurrentTime } from "./time";
import { CallSession, t } from "./types";
import { getWeather } from "./weather";

async function homeAddressOf(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabaseAdmin().from("profiles").select("home_address").eq("id", userId).single();
  return data?.home_address ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeTool(name: string, args: any, session: CallSession): Promise<string> {
  try {
    // Gate unique : les outils qui lisent des données stockées ou envoient/dépensent
    // exigent le code SMS. Le caller-ID seul ne débloque rien de sensible.
    if (requiresVerification(name) && !session.verified) {
      return t(session, {
        fr: "REFUS : demande d'abord le code (request_code), puis vérifie-le (verify_code).",
        en: "REFUSED: ask for the code first (request_code), then verify it (verify_code).",
      });
    }
    switch (name) {
      case "list_events":
        return await listEvents(session, args);
      case "create_event":
        return await createEvent(session, args);
      case "move_event":
        return await moveEvent(session, args);
      case "set_reminder":
        return await setReminder(session, args);
      case "list_reminders":
        return await listReminders(session);
      case "did_i_already":
        return await didIAlready(session, args);
      case "mark_done":
        return await markDone(session, args);
      case "get_weather":
        // Météo libre : la ville du domicile suffit (sensibilité faible), l'adresse
        // n'est jamais prononcée.
        return await getWeather(session, args, await homeAddressOf(session.userId));
      case "get_directions":
        // L'adresse du domicile ne sert d'origine/destination qu'une fois vérifié
        // (un itinéraire depuis/vers « la maison » révélerait l'adresse).
        return await getDirections(session, args, session.verified ? await homeAddressOf(session.userId) : null);
      case "get_current_time":
        return await getCurrentTime(session, args);
      case "find_contact":
        return await findContact(session, args);
      case "send_sms":
        return await sendDictatedSms(session, args);
      case "place_call":
        return await placeCall(session, args);
      case "remember":
        return await remember(session, args);
      case "recall":
        return await recall(session, args);
      case "request_code":
        return await requestCode(session);
      case "verify_code":
        return await verifyCode(session, args);
      default:
        return t(session, { fr: `Outil inconnu : ${name}.`, en: `Unknown tool: ${name}.` });
    }
  } catch (err) {
    console.error(`Outil ${name} en erreur`, err);
    return t(session, {
      fr: "Désolé, ce service ne répond pas pour le moment.",
      en: "Sorry, that service isn't responding right now.",
    });
  }
}
