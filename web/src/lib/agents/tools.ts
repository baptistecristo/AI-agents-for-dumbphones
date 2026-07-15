// Définitions des outils (skills) exposés à l'agent vocal, au format Vapi
// (JSON Schema). L'exécution réelle est dans src/lib/skills/*, appelée par
// /api/vapi/webhook. Un outil = une capacité ; un service externe = un module.
// Les descriptions sont en anglais : elles sont lues par le LLM (qui gère
// aussi bien les appels FR que EN), pas par l'utilisateur.

import { webhookServer } from "../vapi";

function serverTool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
) {
  return {
    type: "function" as const,
    async: false,
    function: {
      name,
      description,
      parameters: { type: "object", properties, required },
    },
    server: webhookServer(),
  };
}

export function agentTools() {
  return [
    // --- Agenda (Google Calendar) ---
    serverTool(
      "list_events",
      "List the user's calendar events for a given day.",
      { day: { type: "string", description: "Requested day as YYYY-MM-DD, or 'today'/'tomorrow'" } },
      ["day"],
    ),
    serverTool(
      "create_event",
      "PROPOSE a new calendar event. With confirmed=false it returns a proposal to read out loud. Only pass confirmed=true after an explicit spoken 'yes' from the user.",
      {
        title: { type: "string", description: "Event title" },
        start: { type: "string", description: "Start in ISO 8601, e.g. 2026-07-15T14:00:00" },
        duration_minutes: { type: "number", description: "Duration in minutes (default 60)" },
        confirmed: { type: "boolean", description: "true only after explicit spoken confirmation" },
      },
      ["title", "start", "confirmed"],
    ),
    serverTool(
      "move_event",
      "PROPOSE to move an existing event. Same confirmation rule as create_event.",
      {
        event_query: { type: "string", description: "Words from the title or the time of the event to move" },
        new_start: { type: "string", description: "New start, ISO 8601" },
        confirmed: { type: "boolean" },
      },
      ["event_query", "new_start", "confirmed"],
    ),

    // --- Rappels ---
    serverTool(
      "set_reminder",
      "Schedule a reminder to be sent by SMS at the requested time.",
      {
        text: { type: "string", description: "Reminder text, e.g. 'take the bread out of the oven'" },
        due_at: { type: "string", description: "When, ISO 8601" },
        recurrence: { type: "string", enum: ["none", "daily", "weekly", "monthly"], description: "Recurrence" },
      },
      ["text", "due_at"],
    ),
    serverTool("list_reminders", "List the user's upcoming reminders.", {}),
    serverTool(
      "did_i_already",
      "Answer 'did I already do X today?' by checking reminders marked as done.",
      { what: { type: "string", description: "The action asked about, e.g. 'watered the plants'" } },
      ["what"],
    ),
    serverTool(
      "mark_done",
      "Mark an action/reminder as done (e.g. the user says they just did it).",
      { what: { type: "string" } },
      ["what"],
    ),

    // --- Météo ---
    serverTool(
      "get_weather",
      "Give the weather for a city (today or tomorrow).",
      {
        city: { type: "string", description: "City. If absent, use the user's home city." },
        day: { type: "string", enum: ["today", "tomorrow"], description: "Day" },
      },
    ),
    serverTool(
      "get_current_time",
      "Give the current local time in a city.",
      {
      city: {
      type: "string",
      description: "City whose current local time is requested",
    },
  },
  ["city"],
),

    // --- Navigation par SMS ---
    serverTool(
      "get_directions",
      "Compute a route and text the steps to the user by SMS, in addition to the spoken summary.",
      {
        destination: { type: "string", description: "Destination address or place" },
        origin: { type: "string", description: "Starting point. If absent: ask 'where are you?' or use the home address." },
        mode: { type: "string", enum: ["walking", "driving", "transit"], description: "Travel mode" },
      },
      ["destination"],
    ),

    // --- Contacts ---
    serverTool(
      "find_contact",
      "Search a contact (phone number) in the user's Google address book.",
      { name: { type: "string", description: "Contact name or nickname" } },
      ["name"],
    ),

    // --- Messages ---
    serverTool(
      "send_sms",
      "PROPOSE to send a dictated SMS. With confirmed=false: returns the text to read back out loud. confirmed=true only after an explicit 'yes'. Sensitive action: requires the verified PIN.",
      {
        to_name: { type: "string", description: "Recipient name (resolved via contacts)" },
        to_number: { type: "string", description: "Or a direct E.164 number" },
        body: { type: "string", description: "Dictated message text" },
        confirmed: { type: "boolean" },
      },
      ["body", "confirmed"],
    ),

    // --- Appels sortants (Rendez-vous / Taxi / Résa) ---
    serverTool(
      "place_call",
      "PROPOSE to place a call on the user's behalf (book an appointment, a taxi, a restaurant…). With confirmed=false: returns a mission recap to read out loud. confirmed=true only after an explicit 'yes'. Sensitive action: requires the verified PIN. The result will be sent by SMS.",
      {
        kind: {
          type: "string",
          enum: ["appointment", "taxi", "resto", "generic"],
          description:
            "Mission preset. 'appointment' = any appointment booking (doctor, hairdresser, garage…), 'taxi' = taxi booking, 'resto' = restaurant booking, 'generic' = anything else.",
        },
        goal: { type: "string", description: "Precise goal, e.g. 'book a haircut this week, mornings preferred'" },
        target_name: { type: "string", description: "Name of the place/person to call" },
        target_number: { type: "string", description: "Number to call if known (otherwise looked up in contacts/memory)" },
        constraints: { type: "string", description: "Useful constraints: time slots, number of people, pickup address…" },
        confirmed: { type: "boolean" },
      },
      ["kind", "goal", "confirmed"],
    ),

    // --- Mémoire ---
    serverTool(
      "remember",
      "Store a durable fact about the user (e.g. 'my mechanic is Garage Dupont, 01 23 45 67 89').",
      {
        key: { type: "string", description: "Short topic, e.g. 'mechanic'" },
        value: { type: "string", description: "The information to remember" },
      },
      ["key", "value"],
    ),
    serverTool(
      "recall",
      "Search the user's memory (places, people, preferences already noted).",
      { query: { type: "string", description: "What to look for" } },
      ["query"],
    ),

    // --- Sécurité ---
    serverTool(
      "verify_pin",
      "Verify the user's spoken PIN. Required before any sensitive action (sending a message, placing a call). NEVER repeat the PIN out loud.",
      { pin: { type: "string", description: "The dictated 4-digit code" } },
      ["pin"],
    ),
  ];
}
