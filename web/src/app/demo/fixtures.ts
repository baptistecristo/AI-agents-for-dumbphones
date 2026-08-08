// Données de la démo : le tableau de bord de Sam, personnage inventé (le même
// que l'appel de la landing). Tout est factice et cohérent d'une page à l'autre
// — l'itinéraire vers le café Oberkampf, le rappel « appeler le proprio », les
// notes — pour que la visite raconte une seule histoire. Les dates sont des
// décalages autour du rendu : la démo reste vivante sans jamais toucher la base.
// Numéros réservés à la fiction (+33 6 39 98 xx xx, 01 99 00 xx xx) et adresse
// e-mail réservée par la RFC (example.com) : rien ici ne peut joindre quelqu'un.

import { Language } from "@/lib/language";
import type { ConsentSource } from "../tableau-de-bord/copy";

export type DemoJobStatus = "pending" | "calling" | "done" | "failed" | "needs_user";
export type DemoRecurrence = "daily" | "weekly" | "monthly" | null;

// Les mêmes colonnes que les pages réelles lisent en base : la démo consomme
// exactement la forme que le tableau de bord attend, rien de plus.
export type DemoData = {
  profile: {
    preferred_name: string;
    full_name: string;
    home_address: string;
    preferred_language: Language;
    voice_speed: number;
    agent_instructions: string;
  };
  phone: { e164: string; label: string; verified_at: string };
  google: { google_email: string; scopes: string[]; connected_at: string };
  calls: { direction: "inbound" | "outbound"; agent: string; summary: string; started_at: string }[];
  jobs: { kind: string; goal: string; status: DemoJobStatus; result: string | null }[];
  reminders: { id: string; text: string; due_at: string; recurrence: DemoRecurrence }[];
  notes: { key: string; value: string }[];
  consents: Record<ConsentSource, boolean>;
  trustedCallers: { subject: string; granted: boolean }[];
};

type DemoContent = {
  profile: { preferred_name: string; full_name: string; home_address: string; agent_instructions: string };
  phoneLabel: string;
  // hoursAgo décroissant du bas vers le haut : la liste est déjà triée comme la
  // requête réelle (started_at desc).
  calls: { direction: "inbound" | "outbound"; agent: string; summary: string; hoursAgo: number }[];
  jobs: { kind: string; goal: string; status: DemoJobStatus; result: string | null }[];
  // inHours croissant : trié comme la requête réelle (due_at asc).
  reminders: { id: string; text: string; inHours: number; recurrence: DemoRecurrence }[];
  // Triées par clé (ordre alphabétique), comme la requête réelle.
  notes: { key: string; value: string }[];
};

const CONTENT: Record<Language, DemoContent> = {
  fr: {
    profile: {
      preferred_name: "Sam",
      full_name: "Sam Fontaine",
      home_address: "12 rue de la Fontaine au Roi, 75011 Paris",
      agent_instructions:
        "Tutoie-moi. Si je mentionne un rendez-vous, propose de le noter dans l'agenda. Et le week-end, pas de rappel avant 9 heures.",
    },
    phoneLabel: "Mon dumbphone",
    calls: [
      {
        direction: "inbound",
        agent: "assistant",
        summary:
          "Itinéraire à pied vers le café Oberkampf envoyé par SMS, point météo, et un rappel posé pour demain : appeler le proprio.",
        hoursAgo: 2.1,
      },
      {
        direction: "outbound",
        agent: "réservation",
        summary: "Chez Marcelle appelé : table pour deux confirmée vendredi soir. Confirmation envoyée par SMS.",
        hoursAgo: 26,
      },
      {
        direction: "inbound",
        agent: "assistant",
        summary: "« Est-ce que j'ai déjà pris mon traitement ? » Oui, déjà coché. Météo du lendemain donnée au passage.",
        hoursAgo: 30.4,
      },
      {
        direction: "inbound",
        agent: "assistant",
        summary: "SMS dicté pour Léa, relu à voix haute, envoyé après confirmation.",
        hoursAgo: 76.2,
      },
      {
        direction: "outbound",
        agent: "rendez-vous",
        summary:
          "Cabinet dentaire appelé. Répondeur au premier essai, menu à touches franchi au second : deux créneaux obtenus, en attente de ton choix.",
        hoursAgo: 99.5,
      },
      {
        direction: "inbound",
        agent: "assistant",
        summary: "Lecture de l'agenda du lendemain, et le rendez-vous de l'après-midi décalé après confirmation.",
        hoursAgo: 143,
      },
    ],
    jobs: [
      {
        kind: "Rendez-vous",
        goal: "Obtenir un créneau chez le dentiste cette semaine",
        status: "needs_user",
        result: "Deux créneaux proposés : mardi matin ou jeudi après-midi. Dis-moi lequel te va, je rappelle et je confirme.",
      },
      {
        kind: "Réservation",
        goal: "Une table pour deux vendredi soir, Chez Marcelle",
        status: "done",
        result: "Table confirmée vendredi 20 h. Confirmation reçue par SMS.",
      },
    ],
    reminders: [
      { id: "r-traitement", text: "Prendre mon traitement", inHours: 18, recurrence: "daily" },
      { id: "r-proprio", text: "Appeler le proprio", inHours: 25.5, recurrence: null },
      { id: "r-plantes", text: "Arroser les plantes", inHours: 68, recurrence: "weekly" },
      { id: "r-lea", text: "Souhaiter son anniversaire à Léa", inHours: 140, recurrence: null },
    ],
    notes: [
      { key: "Boulangerie", value: "Fermée le lundi. La bonne, c'est celle de la rue Saint-Maur." },
      { key: "Café préféré", value: "Le comptoir d'Oberkampf, en terrasse dès qu'il fait beau" },
      { key: "Code du local à vélos", value: "B47, puis la clé ronde" },
      { key: "Vétérinaire", value: "Dr Rivière, 01 99 00 12 34 (pour Nougat)" },
    ],
  },
  en: {
    profile: {
      preferred_name: "Sam",
      full_name: "Sam Fontaine",
      home_address: "12 rue de la Fontaine au Roi, 75011 Paris",
      agent_instructions:
        "Keep it casual. If I mention an appointment, offer to put it in the calendar. And on weekends, no reminders before 9am.",
    },
    phoneLabel: "My dumbphone",
    calls: [
      {
        direction: "inbound",
        agent: "assistant",
        summary:
          "Walking directions to the Oberkampf café sent by SMS, weather check, and a reminder set for tomorrow: call the landlord.",
        hoursAgo: 2.1,
      },
      {
        direction: "outbound",
        agent: "booking",
        summary: "Called Chez Marcelle: table for two confirmed Friday evening. Confirmation sent by SMS.",
        hoursAgo: 26,
      },
      {
        direction: "inbound",
        agent: "assistant",
        summary: "\"Did I already take my medication?\" Yes, already checked off. Tomorrow's weather given along the way.",
        hoursAgo: 30.4,
      },
      {
        direction: "inbound",
        agent: "assistant",
        summary: "Text dictated for Léa, read back out loud, sent after confirmation.",
        hoursAgo: 76.2,
      },
      {
        direction: "outbound",
        agent: "appointment",
        summary:
          "Called the dental practice. Voicemail on the first try, keypad menu cleared on the second: two slots secured, waiting on your pick.",
        hoursAgo: 99.5,
      },
      {
        direction: "inbound",
        agent: "assistant",
        summary: "Read out tomorrow's calendar, and moved the afternoon appointment after confirmation.",
        hoursAgo: 143,
      },
    ],
    jobs: [
      {
        kind: "Appointment",
        goal: "Get a dentist slot this week",
        status: "needs_user",
        result: "Two slots on offer: Tuesday morning or Thursday afternoon. Tell me which works and I'll call back to confirm.",
      },
      {
        kind: "Booking",
        goal: "A table for two Friday evening, Chez Marcelle",
        status: "done",
        result: "Table confirmed Friday 8pm. Confirmation received by SMS.",
      },
    ],
    reminders: [
      { id: "r-meds", text: "Take my medication", inHours: 18, recurrence: "daily" },
      { id: "r-landlord", text: "Call the landlord", inHours: 25.5, recurrence: null },
      { id: "r-plants", text: "Water the plants", inHours: 68, recurrence: "weekly" },
      { id: "r-lea", text: "Wish Léa a happy birthday", inHours: 140, recurrence: null },
    ],
    notes: [
      { key: "Bakery", value: "Closed on Mondays. The good one is on rue Saint-Maur." },
      { key: "Bike room code", value: "B47, then the round key" },
      { key: "Favourite café", value: "Le comptoir d'Oberkampf, on the terrace whenever it's sunny" },
      { key: "Vet", value: "Dr Rivière, 01 99 00 12 34 (for Nougat)" },
    ],
  },
  es: {
    profile: {
      preferred_name: "Sam",
      full_name: "Sam Fontaine",
      home_address: "12 rue de la Fontaine au Roi, 75011 París",
      agent_instructions:
        "Tutéame. Si menciono una cita, propón apuntarla en la agenda. Y el fin de semana, nada de recordatorios antes de las 9.",
    },
    phoneLabel: "Mi dumbphone",
    calls: [
      {
        direction: "inbound",
        agent: "asistente",
        summary:
          "Ruta a pie hasta el café Oberkampf enviada por SMS, parte del tiempo, y un recordatorio para mañana: llamar al casero.",
        hoursAgo: 2.1,
      },
      {
        direction: "outbound",
        agent: "reserva",
        summary: "Llamada a Chez Marcelle: mesa para dos confirmada el viernes por la noche. Confirmación enviada por SMS.",
        hoursAgo: 26,
      },
      {
        direction: "inbound",
        agent: "asistente",
        summary: "« ¿Ya me he tomado el tratamiento? » Sí, ya marcado. El tiempo de mañana, de paso.",
        hoursAgo: 30.4,
      },
      {
        direction: "inbound",
        agent: "asistente",
        summary: "SMS dictado para Léa, releído en voz alta, enviado tras confirmación.",
        hoursAgo: 76.2,
      },
      {
        direction: "outbound",
        agent: "cita",
        summary:
          "Llamada a la clínica dental. Contestador al primer intento, menú de teclas superado al segundo: dos huecos conseguidos, a la espera de tu elección.",
        hoursAgo: 99.5,
      },
      {
        direction: "inbound",
        agent: "asistente",
        summary: "Lectura de la agenda de mañana, y la cita de la tarde movida tras confirmación.",
        hoursAgo: 143,
      },
    ],
    jobs: [
      {
        kind: "Cita",
        goal: "Conseguir un hueco en el dentista esta semana",
        status: "needs_user",
        result: "Dos huecos propuestos: martes por la mañana o jueves por la tarde. Dime cuál te va y vuelvo a llamar para confirmar.",
      },
      {
        kind: "Reserva",
        goal: "Una mesa para dos el viernes por la noche, Chez Marcelle",
        status: "done",
        result: "Mesa confirmada el viernes a las 20 h. Confirmación recibida por SMS.",
      },
    ],
    reminders: [
      { id: "r-tratamiento", text: "Tomar mi tratamiento", inHours: 18, recurrence: "daily" },
      { id: "r-casero", text: "Llamar al casero", inHours: 25.5, recurrence: null },
      { id: "r-plantas", text: "Regar las plantas", inHours: 68, recurrence: "weekly" },
      { id: "r-lea", text: "Felicitar a Léa por su cumpleaños", inHours: 140, recurrence: null },
    ],
    notes: [
      { key: "Cafetería preferida", value: "Le comptoir d'Oberkampf, en la terraza cuando hace bueno" },
      { key: "Código del cuarto de bicis", value: "B47, y luego la llave redonda" },
      { key: "Panadería", value: "Cierra los lunes. La buena es la de la rue Saint-Maur." },
      { key: "Veterinario", value: "Dr. Rivière, 01 99 00 12 34 (para Nougat)" },
    ],
  },
};

const HOUR = 3_600_000;

export function demoData(lang: Language, now: Date): DemoData {
  const t = (hours: number) => new Date(now.getTime() + hours * HOUR).toISOString();
  const c = CONTENT[lang];
  return {
    profile: {
      ...c.profile,
      preferred_language: lang,
      voice_speed: 1.0,
    },
    phone: { e164: "+33639981234", label: c.phoneLabel, verified_at: t(-21 * 24) },
    google: { google_email: "sam@example.com", scopes: ["calendar", "contacts"], connected_at: t(-21 * 24) },
    calls: c.calls.map(({ hoursAgo, ...call }) => ({ ...call, started_at: t(-hoursAgo) })),
    jobs: c.jobs,
    reminders: c.reminders.map(({ inHours, ...r }) => ({ ...r, due_at: t(inHours) })),
    notes: c.notes,
    consents: {
      calendar: true,
      contacts: true,
      sms: true,
      outbound_calls: true,
      memory: true,
      recording: false,
      action_items: true,
      call_recap: true,
    },
    trustedCallers: [{ subject: "+33639981234", granted: true }],
  };
}
