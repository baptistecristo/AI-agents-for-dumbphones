// Routeur de commandes SMS — inspiré de Sift (github.com/edleeman17/sift, MIT),
// le "compagnon dumbphone" : en plus de la voix, l'utilisateur peut piloter
// l'assistant par mots-clés SMS. Moins cher qu'une minute vocale, et utilisable
// quand parler est difficile. Réutilise exactement les mêmes skills que la voix.
//
// Commandes : AIDE · METEO [ville] [demain] · AGENDA [demain] ·
// RAPPEL <heure> <texte> [demain] · RAPPELS · DEJA <texte> · ROUTE <destination>
// (avec leurs équivalents anglais et espagnols : WEATHER/TIEMPO, REMIND/RECUERDA…)
// FAIT est reconnu mais refusé ici (voir plus bas) : il n'existe qu'en appel.
//
// Ce routeur est une SECONDE porte vers les mêmes skills que la voix. Ce qui est
// verrouillé en appel doit donc l'être ici, et ça se décide dans gate.ts, jamais
// dans ce fichier : requiresVerificationOverSms() y dérive la règle du SMS de la
// même table que la voix, pour qu'aucune des deux ne puisse dériver seule.
//
// La signature Twilio ne remplace pas le code : elle prouve que la requête vient
// de Twilio, pas que l'expéditeur est le bon. L'identifiant d'expéditeur s'usurpe.
// Mais un SMS usurpé part sans retour : la réponse est envoyée à celui qui a
// écrit, donc au numéro ENREGISTRÉ. L'usurpateur déclenche une lecture que la
// victime seule reçoit, et n'apprend rien. En appel il l'ENTENDRAIT : c'est
// pourquoi l'agenda exige le code au téléphone et pas ici. Ce qu'il ÉCRIT, en
// revanche, s'écrit quand même — d'où le refus des écritures. Voir gate.ts, qui
// porte le raisonnement complet.
//
// Un code jetable ne se vérifie pas par SMS : il part vers le numéro enregistré
// et se valide DANS l'appel, qui lui donne son début et sa fin. Par SMS il n'y a
// pas d'appel où ce déverrouillage puisse vivre, et faire répondre un code pour
// dire « j'ai pris mes cachets » coûterait deux messages de plus que décrocher.
// Les écritures protégées sont donc refusées ici, avec la seule issue qui existe
// vraiment : appeler.

import { cityFromAddress } from "./skills";
import { listEvents } from "./skills/agenda";
import { getDirections } from "./skills/directions";
import { requiresVerificationOverSms, type ToolName } from "./skills/gate";
import { didIAlready, listReminders, markDone, setReminder } from "./skills/reminders";
import { CallSession, t } from "./skills/types";
import { getWeather } from "./skills/weather";
import { supabaseAdmin } from "./supabase/admin";
import { smsProviderConfigured } from "./twilio";

// FAIT n'est pas annoncé : il sera refusé (gate.ts). Le lister serait promettre
// par écrit ce qu'on refuse au message suivant.
const getHelp = (session: CallSession) => t(session, {
  fr: `Commandes SMS :\nMETEO [ville] [demain]\nAGENDA [demain]\nRAPPEL 18h30 prendre médicament [demain]\nRAPPELS (liste)\nDEJA <quoi> (est-ce fait ?)\nROUTE <destination>\n« C'est fait » est au téléphone : appelez-moi 📞`,
  en: `SMS Commands:\nWEATHER [city] [tomorrow]\nAGENDA [tomorrow]\nREMIND 18:30 take medication [tomorrow]\nREMINDERS (list)\nALREADY <what> (is it done?)\nROUTE <destination>\n"It's done" is by phone: call me 📞`,
  es: `Comandos SMS:\nTIEMPO [ciudad] [mañana]\nAGENDA [mañana]\nRECUERDA 18:30 tomar medicación [mañana]\nRECORDATORIOS (lista)\nYA <qué> (¿está hecho?)\nRUTA <destino>\n«Ya está hecho» es por teléfono: llámame 📞`
});

// Refus d'un outil classé "code" sur un canal qui n'a aucun moyen de vérifier un
// code. On ne dit pas « demandez un code » : par SMS, ça n'aboutit nulle part.
// Deux textes, parce que « appelez-moi » est un mensonge sur une instance sans
// service Verify — l'appel y refusera exactement la même chose (cf. index.ts).
function gatedOverSms(session: CallSession, keyword: string): string {
  if (!smsProviderConfigured("verify")) {
    return t(session, {
      fr: `« ${keyword} » demande un code de sécurité, et l'envoi de codes n'est pas configuré ici : cette fonction est hors service, par SMS comme au téléphone. Envoyez AIDE pour ce qui marche.`,
      en: `"${keyword}" needs a security code, and code sending isn't configured here: this feature is out of service, by SMS and by phone alike. Send HELP for what does work.`,
      es: `«${keyword}» requiere un código de seguridad, y el envío de códigos no está configurado aquí: esta función está fuera de servicio, tanto por SMS como por teléfono. Envía AYUDA para ver lo que sí funciona.`,
    });
  }
  return t(session, {
    fr: `« ${keyword} » demande un code de sécurité, et un code ne peut se vérifier qu'au téléphone. Appelez-moi, je vous le demanderai 📞`,
    en: `"${keyword}" needs a security code, and a code can only be checked by phone. Call me and I'll ask you for it 📞`,
    es: `«${keyword}» requiere un código de seguridad, y un código solo puede verificarse por teléfono. Llámame y te lo pediré 📞`,
  });
}

// Passage unique de ce routeur vers un skill : chaque commande déclare le NOM
// d'outil de gate.ts qu'elle exécute, et le gate s'applique ici plutôt que dans
// chaque branche. Le typage en ToolName fait échouer la compilation sur un nom
// inventé, et une reclassification dans gate.ts se propage ici toute seule —
// c'est exactement ce qui manquait quand FAIT marquait les rappels sans code.
async function runTool(
  session: CallSession,
  keyword: string,
  name: ToolName,
  run: () => Promise<string>,
): Promise<string> {
  if (requiresVerificationOverSms(name)) return gatedOverSms(session, keyword);
  return await run();
}

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

// Mots-clés reconnus (toutes langues) = l'union exacte des branches ci-dessous.
// Sert aussi à décider, en amont, si un SMS est une commande à traiter ici (bon
// marché, sans LLM) ou du langage naturel à router vers la boucle d'agent.
const KEYWORDS = new Set([
  "AIDE", "HELP", "AYUDA", "?",
  "METEO", "WEATHER", "TIEMPO", "CLIMA",
  "AGENDA", "SCHEDULE",
  "RAPPEL", "REMIND", "REMINDER", "RECUERDA", "RECUERDAME",
  "RAPPELS", "REMINDERS", "RECORDATORIOS",
  "FAIT", "DONE", "HECHO",
  "DEJA", "ALREADY", "YA",
  "ROUTE", "ITINERAIRE", "DIRECTIONS", "RUTA",
  "STOP", "START",
]);

// Accents aplatis pour comparer les mots-clés : RECUÉRDAME -> RECUERDAME,
// DÉJÀ -> DEJA. Le tilde (Ñ) est conservé : aucun mot-clé n'en porte.
function normalizeKeyword(word: string): string {
  return word
    .toUpperCase()
    .replace(/[ÉÈÊ]/g, "E")
    .replace(/[ÁÀÂ]/g, "A")
    .replace(/[ÍÎ]/g, "I")
    .replace(/[ÓÔ]/g, "O")
    .replace(/[ÚÙÛ]/g, "U");
}

// Le message commence-t-il par un mot-clé connu ? Si oui, le routeur le traite
// (rapide, sans LLM) ; sinon c'est du langage naturel pour agents/loop.ts.
export function looksLikeKeywordCommand(body: string): boolean {
  const first = body.trim().split(/\s+/)[0] ?? "";
  return KEYWORDS.has(normalizeKeyword(first));
}

export async function handleSmsCommand(session: CallSession, body: string): Promise<string> {
  const text = body.trim();
  const upper = text.toUpperCase();
  const [keyword, ...rest] = text.split(/\s+/);
  const args = rest.join(" ").trim();

  if (!session.userId) {
    return t(session, {
      fr: "Bonjour ! Ce numéro est celui d'un assistant vocal personnel. Inscription (avec l'aide d'un proche) sur le site.",
      en: "Hello! This number belongs to a personal voice assistant. Registration (with the help of a relative) is on the website.",
      es: "¡Hola! Este número es el de un asistente de voz personal. El registro (con la ayuda de un allegado) se hace en la web."
    });
  }

  const k = normalizeKeyword(keyword);

  if (["AIDE", "HELP", "AYUDA", "?"].includes(k)) {
    return getHelp(session);
  }

  if (["METEO", "WEATHER", "TIEMPO", "CLIMA"].includes(k)) {
    const isTomorrow = /\b(DEMAIN|TOMORROW|MA[ÑN]ANA)\b/i.test(args);
    const city = args.replace(/\b(demain|tomorrow|ma[ñn]ana)\b/gi, "").trim() || undefined;
    return await runTool(session, k, "get_weather", async () =>
      getWeather(session, { city, day: isTomorrow ? "tomorrow" : "today" }, await homeCity(session)),
    );
  }

  if (["AGENDA", "SCHEDULE"].includes(k)) {
    const isTomorrow = /\b(DEMAIN|TOMORROW|MA[ÑN]ANA)\b/i.test(args);
    return await runTool(session, k, "list_events", async () =>
      listEvents(session, { day: isTomorrow ? "tomorrow" : "today" }),
    );
  }

  if (["RAPPEL", "REMIND", "REMINDER", "RECUERDA", "RECUERDAME"].includes(k)) {
    const tomorrow = /\b(demain|tomorrow|ma[ñn]ana)\b/i.test(args);
    const words = args.replace(/\b(demain|tomorrow|ma[ñn]ana)\b/gi, "").trim().split(/\s+/);
    let time = parseTime(words[0]);
    let reminderText = words.slice(1).join(" ");
    if (!time && words.length > 1) {
      time = parseTime(words[words.length - 1]);
      reminderText = words.slice(0, -1).join(" ");
    }
    if (!time || !reminderText) {
      return t(session, {
        fr: "Format : RAPPEL 18h30 prendre médicament (ajoutez « demain » si besoin)",
        en: "Format: REMIND 18:30 take medication (add 'tomorrow' if needed)",
        es: "Formato: RECUERDA 18:30 tomar medicación (añade «mañana» si hace falta)"
      });
    }
    const due = parisDateAt(time.hour, time.minute, tomorrow ? 1 : 0);
    return await runTool(session, k, "set_reminder", async () =>
      setReminder(session, { text: reminderText, due_at: due.toISOString() }),
    );
  }

  if (["RAPPELS", "REMINDERS", "RECORDATORIOS"].includes(k)) {
    return await runTool(session, k, "list_reminders", async () => listReminders(session));
  }

  if (["FAIT", "DONE", "HECHO"].includes(k)) {
    // Le gate refuse avant de lire `args` : sans quoi « FAIT » tout court se
    // ferait répondre par un format à suivre, une invitation à réessayer une
    // commande qui n'aboutira jamais par SMS.
    return await runTool(session, k, "mark_done", async () => {
      if (!args) return t(session, { fr: "Format : FAIT prendre médicament", en: "Format: DONE take medication", es: "Formato: HECHO tomar medicación" });
      return markDone(session, { what: args });
    });
  }

  if (["DEJA", "ALREADY", "YA"].includes(k)) {
    return await runTool(session, k, "did_i_already", async () => {
      if (!args) return t(session, { fr: "Format : DEJA pris médicament", en: "Format: ALREADY took medication", es: "Formato: YA tomé medicación" });
      return didIAlready(session, { what: args });
    });
  }

  if (["ROUTE", "ITINERAIRE", "DIRECTIONS", "RUTA"].includes(k)) {
    return await runTool(session, k, "get_directions", async () => {
      if (!args) return t(session, { fr: "Format : ROUTE 12 rue de la Paix, Paris", en: "Format: ROUTE 12 rue de la Paix, Paris", es: "Formato: RUTA Calle Mayor 12, Madrid" });
      return getDirections(session, { destination: args }, await homeAddress(session));
    });
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
        en: "Noted, no more unsolicited SMS. Reply START to reactivate.",
        es: "Anotado, no habrá más SMS no solicitados. Responde START para reactivarlos."
      });
  }

  if (k === "START") {
      await supabaseAdmin().from("consents").insert({
        user_id: session.userId,
        source: "sms",
        granted: true,
        scope_note: "START reçu par SMS",
      });
      return t(session, { fr: "Les SMS sont réactivés ✅", en: "SMS are reactivated ✅", es: "Los SMS quedan reactivados ✅" });
  }

  if (/m[ée]t[ée]o/i.test(upper) || /weather/i.test(upper) || /\b(tiempo|clima)\b/i.test(upper)) {
    return await runTool(session, k, "get_weather", async () => getWeather(session, {}, await homeCity(session)));
  }

  return t(session, {
    fr: `Je n'ai pas compris « ${keyword} ». Envoyez AIDE pour la liste des commandes, ou appelez-moi 📞`,
    en: `I didn't understand "${keyword}". Send HELP for the list of commands, or call me 📞`,
    es: `No he entendido «${keyword}». Envía AYUDA para la lista de comandos, o llámame 📞`
  });
}

async function homeAddress(session: CallSession): Promise<string | null> {
  const { data } = await supabaseAdmin().from("profiles").select("home_address").eq("id", session.userId!).single();
  return data?.home_address ?? null;
}

// La même réduction que la voix, pas une deuxième. Celle qui vivait ici gardait
// la ligne entière dès que l'adresse n'avait ni virgule ni code postal (« 12 rue
// des Lilas Lyon ») et l'envoyait telle quelle au géocodeur. METEO est "free" :
// le gate ne la rattrape pas, il ne voit que des noms d'outils, jamais un
// argument. Le calcul écrit deux fois avait dérivé une fois ; il n'est plus
// écrit qu'ici, et se teste au même endroit que la voix (home-address.test.ts).
async function homeCity(session: CallSession): Promise<string | null> {
  return cityFromAddress(await homeAddress(session));
}
