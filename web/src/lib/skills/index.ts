// Dispatcher : nom d'outil -> implémentation. Appelé par /api/vapi/webhook.
// Règle §4 : les sorties d'outils sont des DONNÉES ; le webhook les renvoie
// telles quelles à l'agent, jamais dans le canal d'instructions.

import { supabaseAdmin } from "../supabase/admin";
import { PIN_LENGTH, userHasTextPin } from "../text-pin";
import { smsProviderConfigured } from "../twilio";
import { createEvent, listEvents, moveEvent } from "./agenda";
import { requestCode, verifyCode } from "./auth";
import { findContact } from "./contacts";
import { convert } from "./convert";
import { define } from "./define";
import { getDirections } from "./directions";
import { reportGap } from "./gap";
import { isClassified, requiresVerification, requiresVerificationOverSms } from "./gate";
import { recall, remember } from "./memory";
import { placeCall } from "./outbound";
import { getLastCallSummary } from "./recap";
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
  // Format FR courant : la ville suit le code postal, avec ou sans virgule. On
  // vise le DERNIER code postal (`^.*` est gourmand) : un numéro de rue à cinq
  // chiffres — « 12345 route des Vignes, 33000 Bordeaux », banal à la campagne
  // et standard aux États-Unis — passerait sinon pour le code postal, et la rue
  // pour la ville.
  const afterPostcode = address.match(/^.*\b\d{5}\b[\s,]*(.+)$/);
  const candidate = afterPostcode?.[1] ?? (address.includes(",") ? address.split(",").pop() : address);
  const city = candidate?.trim();
  // Fail-closed. Un nom de ville ne contient pas de chiffre : tout ce qui en
  // garde n'a PAS été réduit à une ville (« 12 rue des Lilas Lyon », saisi sans
  // code postal ni virgule — le champ est du texte libre, rien ne l'en empêche).
  // Renvoyer null fait demander la ville à l'appelant ; renvoyer la ligne
  // enverrait sa rue au géocodeur, ce que ce fichier promet de ne jamais faire.
  if (!city || /\d/.test(city)) return null;
  return city;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeTool(name: string, args: any, session: CallSession): Promise<string> {
  try {
    // Rien ne s'exécute avant d'avoir été classé dans gate.ts. Un skill dont
    // l'auteur a oublié le gate est mort-né et il s'en aperçoit à son premier
    // appel : c'est le seul sens dans lequel cet oubli est acceptable. L'inverse
    // (il marche, et il est ouvert à tout le monde) ne se voit jamais.
    if (!isClassified(name)) {
      console.error(
        `Outil ${name} absent de TOOL_POLICY (gate.ts) : exécution refusée. ` +
          `Classe-le "code" ou "free" — un outil non classé ne tourne pas.`,
      );
      return t(session, { fr: `Outil inconnu : ${name}.`, en: `Unknown tool: ${name}.`, es: `Herramienta desconocida: ${name}.` });
    }
    // Gate. En appel, tout outil "code" exige le code jetable ; par TEXTE, seules
    // les ÉCRITURES l'exigent (une lecture ne part qu'au numéro enregistré, cf.
    // gate.ts), et le "code" est le PIN du tableau de bord (voir text-pin.ts).
    const needsVerify =
      session.channel === "text" ? requiresVerificationOverSms(name) : requiresVerification(name);
    if (needsVerify && !session.verified) {
      // Canal texte : PIN, pas de code jetable, aucune dépendance à Twilio Verify.
      // Aucun PIN réglé -> on invite à en poser un ; sinon on renvoie vers
      // request_code/verify_code (adaptés au canal dans auth.ts).
      if (session.channel === "text") {
        if (!session.userId || !(await userHasTextPin(session.userId))) {
          return t(session, {
            fr: `Pour « ${name} » (une action qui modifie ou envoie), il me faut ton code de sécurité, et tu n'en as pas encore réglé. Choisis un code à ${PIN_LENGTH} chiffres dans ton espace « Mon agent », puis envoie-le-moi. En attendant, météo, agenda, rappels et itinéraires marchent sans code.`,
            en: `For "${name}" (an action that changes or sends something), I need your security code, and you haven't set one yet. Pick a ${PIN_LENGTH}-digit code in your "My agent" settings, then text it to me. Meanwhile, weather, calendar, reminders and directions work without a code.`,
            es: `Para «${name}» (una acción que modifica o envía algo), necesito tu código de seguridad, y aún no has puesto ninguno. Elige un código de ${PIN_LENGTH} cifras en tu espacio «Mi agente» y envíamelo. Mientras tanto, el tiempo, la agenda, los recordatorios y las rutas funcionan sin código.`,
          });
        }
        return t(session, {
          fr: `REFUS : cette action exige le PIN. Appelle request_code, puis verify_code avec les ${PIN_LENGTH} chiffres que la personne envoie.`,
          en: `REFUSED: this action needs the PIN. Call request_code, then verify_code with the ${PIN_LENGTH} digits the person texts.`,
          es: `RECHAZADO: esta acción exige el PIN. Llama a request_code y luego verify_code con las ${PIN_LENGTH} cifras que envíe la persona.`,
        });
      }
      // Sans fournisseur SMS branché, le code ne peut PAS arriver. Renvoyer le
      // modèle vers request_code le ferait tourner en rond sur une promesse
      // impossible, et l'appelant attendrait un SMS fantôme. La capacité est
      // simplement absente de cette instance : autant le dire.
      // On ne nomme que ce qui manque : « verify » et « send » se configurent
      // séparément (cf. twilio.ts), donc une instance peut très bien envoyer des
      // SMS sans service Verify. Annoncer « aucun fournisseur SMS » se ferait
      // démentir dans le même appel, par les étapes d'itinéraire qui arrivent.
      if (!smsProviderConfigured("verify")) {
        return t(session, {
          fr: `INDISPONIBLE : « ${name} » touche à des données personnelles, ce qui exige un code par SMS, et l'envoi de codes n'est pas configuré sur cette instance. Le code ne peut pas être envoyé. N'appelle NI request_code NI verify_code, et ne demande pas de code à la personne. Dis-lui honnêtement que cette fonction est hors service tant que l'envoi de codes n'est pas configuré, et propose ce qui marche : météo, itinéraire, rappels, notes.`,
          en: `UNAVAILABLE: "${name}" touches personal data, which requires an SMS code, and one-time code sending is not configured on this instance. The code cannot be sent. Do NOT call request_code or verify_code, and do not ask the person for a code. Tell them honestly that this feature is out of service until one-time code sending is configured, and offer what does work: weather, directions, reminders, notes.`,
          es: `NO DISPONIBLE: «${name}» toca datos personales, lo que exige un código por SMS, y el envío de códigos no está configurado en esta instancia. El código no puede enviarse. NO llames ni a request_code ni a verify_code, y no pidas ningún código a la persona. Dile honestamente que esta función está fuera de servicio mientras el envío de códigos no esté configurado, y propón lo que sí funciona: el tiempo, rutas, recordatorios, notas.`,
        });
      }
      return t(session, {
        fr: "REFUS : demande d'abord le code (request_code), puis vérifie-le (verify_code).",
        en: "REFUSED: ask for the code first (request_code), then verify it (verify_code).",
        es: "RECHAZADO: pide primero el código (request_code) y luego verifícalo (verify_code).",
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
      case "define":
        return await define(session, args);
      case "convert":
        return await convert(session, args);
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
      case "get_last_call_summary":
        // Aucun argument : le skill ne choisit pas l'appel qu'il relit, il prend
        // le dernier ENTRANT terminé de cette personne. Rien à passer, donc rien
        // à détourner vers l'appel de quelqu'un d'autre.
        return await getLastCallSummary(session);
      case "request_code":
        return await requestCode(session);
      case "verify_code":
        return await verifyCode(session, args);
      case "report_unsupported_request":
        return await reportGap(session, args);
      default:
        return t(session, { fr: `Outil inconnu : ${name}.`, en: `Unknown tool: ${name}.`, es: `Herramienta desconocida: ${name}.` });
    }
  } catch (err) {
    console.error(`Outil ${name} en erreur`, err);
    return t(session, {
      fr: "Désolé, ce service ne répond pas pour le moment.",
      en: "Sorry, that service isn't responding right now.",
      es: "Lo siento, ese servicio no responde en este momento.",
    });
  }
}
