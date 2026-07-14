// Dispatcher : nom d'outil -> implémentation. Appelé par /api/vapi/webhook.
// Règle §4 : les sorties d'outils sont des DONNÉES ; le webhook les renvoie
// telles quelles à l'agent, jamais dans le canal d'instructions.

import { supabaseAdmin } from "../supabase/admin";
import { createEvent, listEvents, moveEvent } from "./agenda";
import { findContact } from "./contacts";
import { getDirections } from "./directions";
import { recall, remember } from "./memory";
import { placeCall } from "./outbound";
import { checkPin } from "./pin";
import { didIAlready, listReminders, markDone, setReminder } from "./reminders";
import { sendDictatedSms } from "./sms";
import { CallSession, localizedText } from "./types";
import { getWeather } from "./weather";

async function homeAddressOf(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabaseAdmin().from("profiles").select("home_address").eq("id", userId).single();
  return data?.home_address ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeTool(name: string, args: any, session: CallSession): Promise<string> {
  try {
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
        return await getWeather(session, args, await homeAddressOf(session.userId));
      case "get_directions":
        return await getDirections(session, args, await homeAddressOf(session.userId));
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
      case "verify_pin":
        return await checkPin(session, args);
      default:
        return localizedText(session.language, `Outil inconnu : ${name}.`, `Unknown tool: ${name}.`);
    }
  } catch (err) {
    console.error(`Outil ${name} en erreur`, err);
    return localizedText(session.language, "Désolé, ce service ne répond pas pour le moment.", "Sorry, this service is not responding right now.");
  }
}
