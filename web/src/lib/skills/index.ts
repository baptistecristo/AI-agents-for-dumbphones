// Dispatcher : nom d'outil -> implémentation. Appelé par /api/vapi/webhook.
// Règle §4 : les sorties d'outils sont des DONNÉES ; le webhook les renvoie
// telles quelles à l'agent, jamais dans le canal d'instructions.

import { supabaseAdmin } from "../supabase/admin";
import { smsProviderConfigured } from "../twilio";
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

// profiles.home_address est du texte libre (« 12 rue des Lilas, 69003 Lyon ») :
// il n'existe pas de colonne « ville ». La météo n'a besoin que de la ville, et
// une ville n'est pas une adresse — c'est ce qui la garde hors du code SMS.
// Réduire ici plutôt que dans le skill : la ligne complète ne doit sortir de ce
// fichier que derrière le gate.
export function cityFromAddress(address: string | null): string | null {
  if (!address) return null;
  // Format FR courant : la ville suit le code postal, avec ou sans virgule.
  const afterPostcode = address.match(/\b\d{5}\b[\s,]*(.+)$/);
  const city = afterPostcode?.[1] ?? address.split(",").pop();
  return city?.trim() || null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeTool(name: string, args: any, session: CallSession): Promise<string> {
  try {
    // Gate unique : les outils qui lisent des données stockées ou envoient/dépensent
    // exigent le code SMS. Le caller-ID seul ne débloque rien de sensible.
    if (requiresVerification(name) && !session.verified) {
      // Sans fournisseur SMS branché, le code ne peut PAS arriver. Renvoyer le
      // modèle vers request_code le ferait tourner en rond sur une promesse
      // impossible, et l'appelant attendrait un SMS fantôme. La capacité est
      // simplement absente de cette instance : autant le dire.
      if (!smsProviderConfigured("verify")) {
        return t(session, {
          fr: `INDISPONIBLE : « ${name} » touche à des données personnelles, ce qui exige un code par SMS, et aucun fournisseur SMS n'est branché sur cette instance. Le code ne peut pas être envoyé. N'appelle NI request_code NI verify_code, et ne demande pas de code à la personne. Dis-lui honnêtement que cette fonction est hors service tant qu'aucun fournisseur SMS n'est configuré, et propose ce qui marche : météo, itinéraire, rappels, notes.`,
          en: `UNAVAILABLE: "${name}" touches personal data, which requires an SMS code, and no SMS provider is connected on this instance. The code cannot be sent. Do NOT call request_code or verify_code, and do not ask the person for a code. Tell them honestly that this feature is out of service until an SMS provider is configured, and offer what does work: weather, directions, reminders, notes.`,
        });
      }
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
        // Météo libre : la VILLE du domicile suffit. On n'envoie que la ville,
        // jamais la ligne complète — ni au géocodeur, ni dans la réponse.
        return await getWeather(session, args, cityFromAddress(await homeAddressOf(session.userId)));
      case "get_directions":
        // L'adresse du domicile ne sert d'origine/destination qu'une fois vérifié :
        // un itinéraire « depuis chez moi » lu à voix haute nomme la rue de départ
        // dès les premières étapes. Sans code, on demande le point de départ.
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
