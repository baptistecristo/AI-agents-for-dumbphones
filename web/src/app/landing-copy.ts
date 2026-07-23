// Textes de la landing en FR/EN/ES. Même structure dans les trois langues :
// TypeScript refuse une langue incomplète, comme t() côté skills. Le décor
// reste parisien dans les trois langues — c'est un produit fait en France,
// l'appel d'exemple n'a pas à déménager.

import { Language } from "@/lib/language";

export type LandingCopy = {
  nav: { findPhone: string; signIn: string; createAccount: string };
  hero: {
    titleTop: string;
    titleHighlight: string;
    lead: string;
    cta: string;
    readyLine1: string;
    readyLine2: string;
  };
  call: { aria: string; caption: string; lines: { who: "j" | "a"; text: string }[] };
  banner: string;
  how: { title: string; steps: { n: string; title: string; text: string }[] };
  capabilities: {
    title: string;
    items: { icon: string; title: string; text: string }[];
    sms: { lead: string; kw1: string; kw2: string; or: string; kw3: string; tail: string };
  };
  phones: { title: string; text: string; cta: string };
  trust: { title: string; items: { title: string; text: string }[] };
  finalCta: { title: string; text: string; button: string };
  footer: { tagline: string; made: string };
};

export const LANDING: Record<Language, LandingCopy> = {
  fr: {
    nav: { findPhone: "Trouver un téléphone", signIn: "Se connecter", createAccount: "Créer mon compte" },
    hero: {
      titleTop: "Tu as largué le smartphone.",
      titleHighlight: "Garde le côté utile.",
      lead: "%BRAND% est un assistant au bout du fil, pour celles et ceux qui ont troqué le doomscroll contre un téléphone simple. Météo, itinéraires, rappels, un SMS dicté, une table réservée : tu appelles, tu demandes, tu raccroches. Et tu retournes à ta vie.",
      cta: "Créer mon compte →",
      readyLine1: "Prêt en 10 minutes.",
      readyLine2: "Un dumbphone et ce site suffisent.",
    },
    call: {
      aria: "Exemple d'appel entre Sam et l'assistant",
      caption: "Appel en cours — Sam, depuis son téléphone à touches",
      lines: [
        { who: "j", text: "Salut ! Je retrouve Léa au café Oberkampf. C'est par où, depuis chez moi ?" },
        { who: "a", text: "Salut Sam. Douze minutes à pied : rue de la Fontaine au Roi, puis deuxième à gauche. Je t'envoie les étapes par SMS ?" },
        { who: "j", text: "Ouais. Et il pleut, dehors ?" },
        { who: "a", text: "Non — 19 degrés, ciel dégagé. Ça se couvre en fin de journée par contre." },
        { who: "j", text: "Ok. Tu peux me rappeler d'appeler le proprio demain à 18 heures ?" },
        { who: "a", text: "Noté : un SMS demain à 18 heures. Autre chose ?" },
      ],
    },
    banner: "Aucune application. Aucun écran. Aucun compte à scroller. Juste ta voix.",
    how: {
      title: "Comment ça marche",
      steps: [
        { n: "1", title: "Tu crées ton compte", text: "Sur ce site : ton numéro, ton agenda Google si tu veux. Dix minutes, une seule fois." },
        { n: "2", title: "Tu appelles ton numéro", text: "Depuis ton dumbphone — ou n'importe quel téléphone. L'assistant décroche, te reconnaît, et va droit au but." },
        { n: "3", title: "Les choses se font", text: "Itinéraire par SMS, rappel programmé, table réservée. Tout ce qui engage est relu à voix haute et confirmé avant d'être fait. Compte-rendu par SMS." },
      ],
    },
    capabilities: {
      title: "Ce que tu peux lui demander",
      items: [
        { icon: "📅", title: "L'agenda", text: "« Qu'est-ce que j'ai demain ? » — tes rendez-vous, dits de vive voix, ajoutés ou déplacés à la demande." },
        { icon: "🔔", title: "Les rappels", text: "« Rappelle-moi d'appeler le proprio à 18 heures. » Le rappel arrive par SMS, à l'heure dite." },
        { icon: "🌤", title: "La météo", text: "Aujourd'hui ou demain, pour savoir si tu sors en veste ou en t-shirt." },
        { icon: "🗺", title: "Le chemin", text: "L'itinéraire expliqué à voix haute, puis envoyé par SMS, étape par étape, pour le suivre en route." },
        { icon: "📞", title: "Les appels que tu n'as pas envie de passer", text: "Réserver une table, un taxi, prendre un rendez-vous : l'assistant appelle, négocie, et rend compte par SMS." },
        { icon: "✉️", title: "Les messages", text: "Un SMS dicté à voix haute, relu avant l'envoi. Rien ne part sans un « oui » clair." },
      ],
      sms: { lead: "Et par SMS aussi : envoie", kw1: "METEO", kw2: "AGENDA", or: "ou", kw3: "RAPPEL 18h appeler le proprio", tail: "au même numéro." },
    },
    phones: {
      title: "Pas encore de téléphone simple ?",
      text: "Barre ou clapet, avec Google Maps ou juste le strict nécessaire, en Europe ou ailleurs : notre comparateur t'aide à trouver le tien, filtres à l'appui — et distingue honnêtement un vrai téléphone simple d'un smartphone déguisé.",
      cta: "Trouver mon téléphone →",
    },
    trust: {
      title: "Conçu pour être sûr, pas pour te retenir",
      items: [
        { title: "Un code à usage unique, à l'oral", text: "Envoyer un message ou passer un appel à ta place exige un code reçu par SMS sur ton numéro, pendant l'appel. Un numéro d'appelant peut être usurpé ; le code qui arrive sur ton téléphone, non." },
        { title: "Rien ne part sans un « oui »", text: "Chaque action est relue à voix haute et attend une confirmation claire. Une hésitation vaut non." },
        { title: "Des données en Europe", text: "Consentements enregistrés et révocables, données hébergées en Europe, droit à l'effacement. Tu vois tout sur ton tableau de bord. Et le code est open-source." },
      ],
    },
    finalCta: {
      title: "Garde l'utile. Largue le reste.",
      text: "Crée ton compte, relie ton numéro, choisis ton code secret. Il ne reste plus qu'à appeler.",
      button: "Commencer maintenant",
    },
    footer: { tagline: "l'assistant qu'on appelle, tout simplement.", made: "Fait en France · Données hébergées en Europe · RGPD" },
  },
  en: {
    nav: { findPhone: "Find a phone", signIn: "Sign in", createAccount: "Create my account" },
    hero: {
      titleTop: "You ditched the smartphone.",
      titleHighlight: "Keep the useful part.",
      lead: "%BRAND% is an assistant at the end of the line, for people who traded the doomscroll for a simple phone. Weather, directions, reminders, a dictated text, a booked table: you call, you ask, you hang up. And you get back to your life.",
      cta: "Create my account →",
      readyLine1: "Ready in 10 minutes.",
      readyLine2: "A dumbphone and this site are all you need.",
    },
    call: {
      aria: "Sample call between Sam and the assistant",
      caption: "Call in progress — Sam, from their keypad phone",
      lines: [
        { who: "j", text: "Hey! I'm meeting Léa at the Oberkampf café. How do I get there from home?" },
        { who: "a", text: "Hey Sam. Twelve minutes on foot: rue de la Fontaine au Roi, then second left. Want the steps by SMS?" },
        { who: "j", text: "Yeah. And is it raining out there?" },
        { who: "a", text: "No — 19 degrees, clear skies. It does cloud over late afternoon though." },
        { who: "j", text: "Ok. Can you remind me to call the landlord tomorrow at 6pm?" },
        { who: "a", text: "Noted: a text tomorrow at 6pm. Anything else?" },
      ],
    },
    banner: "No app. No screen. No feed to scroll. Just your voice.",
    how: {
      title: "How it works",
      steps: [
        { n: "1", title: "You create your account", text: "On this site: your number, your Google calendar if you want. Ten minutes, once." },
        { n: "2", title: "You call your number", text: "From your dumbphone — or any phone. The assistant picks up, recognizes you, and gets to the point." },
        { n: "3", title: "Things get done", text: "Directions by SMS, reminder scheduled, table booked. Anything that commits you is read back out loud and confirmed first. Report by SMS." },
      ],
    },
    capabilities: {
      title: "What you can ask it",
      items: [
        { icon: "📅", title: "Your calendar", text: "\"What's on tomorrow?\" — your appointments, spoken out loud, added or moved on request." },
        { icon: "🔔", title: "Reminders", text: "\"Remind me to call the landlord at 6pm.\" The reminder arrives by SMS, right on time." },
        { icon: "🌤", title: "The weather", text: "Today or tomorrow, to know whether you're going out in a jacket or a t-shirt." },
        { icon: "🗺", title: "The way there", text: "The route explained out loud, then sent by SMS, step by step, to follow on the go." },
        { icon: "📞", title: "The calls you'd rather not make", text: "Book a table, a taxi, an appointment: the assistant calls, negotiates, and reports back by SMS." },
        { icon: "✉️", title: "Messages", text: "A text dictated out loud, read back before sending. Nothing goes out without a clear \"yes\"." },
      ],
      sms: { lead: "By SMS too: send", kw1: "WEATHER", kw2: "AGENDA", or: "or", kw3: "REMIND 18:30 call the landlord", tail: "to the same number." },
    },
    phones: {
      title: "No simple phone yet?",
      text: "Bar or flip, with Google Maps or just the bare essentials, in Europe or elsewhere: our comparator helps you find yours, filters included — and honestly tells a true simple phone from a smartphone in disguise.",
      cta: "Find my phone →",
    },
    trust: {
      title: "Built to be safe, not to keep you hooked",
      items: [
        { title: "A one-time code, spoken", text: "Sending a message or placing a call on your behalf requires a code texted to your number during the call. A caller ID can be spoofed; the code that lands on your phone can't." },
        { title: "Nothing goes out without a \"yes\"", text: "Every action is read back out loud and waits for clear confirmation. Hesitation counts as no." },
        { title: "Data in Europe", text: "Recorded, revocable consents, data hosted in Europe, right to erasure. You see everything on your dashboard. And the code is open-source." },
      ],
    },
    finalCta: {
      title: "Keep the useful. Ditch the rest.",
      text: "Create your account, link your number, pick your secret code. All that's left is to call.",
      button: "Start now",
    },
    footer: { tagline: "the assistant you just call.", made: "Made in France · Data hosted in Europe · GDPR" },
  },
  es: {
    nav: { findPhone: "Encontrar un teléfono", signIn: "Iniciar sesión", createAccount: "Crear mi cuenta" },
    hero: {
      titleTop: "Has dejado el smartphone.",
      titleHighlight: "Quédate con lo útil.",
      lead: "%BRAND% es un asistente al otro lado de la línea, para quienes cambiaron el doomscroll por un teléfono básico. El tiempo, rutas, recordatorios, un SMS dictado, una mesa reservada: llamas, pides, cuelgas. Y vuelves a tu vida.",
      cta: "Crear mi cuenta →",
      readyLine1: "Listo en 10 minutos.",
      readyLine2: "Basta con un dumbphone y esta web.",
    },
    call: {
      aria: "Ejemplo de llamada entre Sam y el asistente",
      caption: "Llamada en curso — Sam, desde su teléfono de teclas",
      lines: [
        { who: "j", text: "¡Hola! He quedado con Léa en el café Oberkampf. ¿Por dónde se va desde mi casa?" },
        { who: "a", text: "Hola Sam. Doce minutos a pie: rue de la Fontaine au Roi y luego la segunda a la izquierda. ¿Te envío los pasos por SMS?" },
        { who: "j", text: "Vale. ¿Y está lloviendo fuera?" },
        { who: "a", text: "No — 19 grados, cielo despejado. Aunque se nubla al final del día." },
        { who: "j", text: "Ok. ¿Me recuerdas llamar al casero mañana a las 6 de la tarde?" },
        { who: "a", text: "Anotado: un SMS mañana a las 18:00. ¿Algo más?" },
      ],
    },
    banner: "Sin aplicación. Sin pantalla. Sin cuentas que scrollear. Solo tu voz.",
    how: {
      title: "Cómo funciona",
      steps: [
        { n: "1", title: "Creas tu cuenta", text: "En esta web: tu número, tu agenda de Google si quieres. Diez minutos, una sola vez." },
        { n: "2", title: "Llamas a tu número", text: "Desde tu dumbphone — o cualquier teléfono. El asistente descuelga, te reconoce y va al grano." },
        { n: "3", title: "Las cosas se hacen", text: "Ruta por SMS, recordatorio programado, mesa reservada. Todo lo que compromete se relee en voz alta y se confirma antes de hacerse. Resumen por SMS." },
      ],
    },
    capabilities: {
      title: "Lo que puedes pedirle",
      items: [
        { icon: "📅", title: "La agenda", text: "«¿Qué tengo mañana?» — tus citas, dichas de viva voz, añadidas o movidas cuando lo pidas." },
        { icon: "🔔", title: "Los recordatorios", text: "«Recuérdame llamar al casero a las 6.» El recordatorio llega por SMS, a la hora dicha." },
        { icon: "🌤", title: "El tiempo", text: "Hoy o mañana, para saber si sales con chaqueta o en camiseta." },
        { icon: "🗺", title: "El camino", text: "La ruta explicada en voz alta y enviada por SMS, paso a paso, para seguirla por el camino." },
        { icon: "📞", title: "Las llamadas que no te apetece hacer", text: "Reservar una mesa, un taxi, pedir una cita: el asistente llama, negocia y te lo cuenta por SMS." },
        { icon: "✉️", title: "Los mensajes", text: "Un SMS dictado en voz alta, releído antes de enviarse. Nada sale sin un «sí» claro." },
      ],
      sms: { lead: "Y por SMS también: envía", kw1: "TIEMPO", kw2: "AGENDA", or: "o", kw3: "RECUERDA 18:30 llamar al casero", tail: "al mismo número." },
    },
    phones: {
      title: "¿Aún sin teléfono básico?",
      text: "De barra o de tapa, con Google Maps o solo lo imprescindible, en Europa o fuera: nuestro comparador te ayuda a encontrar el tuyo, con filtros — y distingue honestamente un teléfono básico de verdad de un smartphone disfrazado.",
      cta: "Encontrar mi teléfono →",
    },
    trust: {
      title: "Diseñado para ser seguro, no para retenerte",
      items: [
        { title: "Un código de un solo uso, de viva voz", text: "Enviar un mensaje o hacer una llamada en tu nombre exige un código recibido por SMS en tu número, durante la llamada. Un número de llamada puede suplantarse; el código que llega a tu teléfono, no." },
        { title: "Nada sale sin un «sí»", text: "Cada acción se relee en voz alta y espera una confirmación clara. Una duda cuenta como no." },
        { title: "Datos en Europa", text: "Consentimientos registrados y revocables, datos alojados en Europa, derecho al olvido. Lo ves todo en tu panel. Y el código es open-source." },
      ],
    },
    finalCta: {
      title: "Quédate con lo útil. Suelta el resto.",
      text: "Crea tu cuenta, vincula tu número, elige tu código secreto. Solo queda llamar.",
      button: "Empezar ahora",
    },
    footer: { tagline: "el asistente al que simplemente llamas.", made: "Hecho en Francia · Datos alojados en Europa · RGPD" },
  },
};
