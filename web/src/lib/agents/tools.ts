// Définitions des outils (skills) exposés à l'agent vocal, au format Vapi
// (JSON Schema). L'exécution réelle est dans src/lib/skills/*, appelée par
// /api/vapi/webhook. Un outil = une capacité ; un service externe = un module.

import { APP_URL } from "../env";

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
    server: { url: `${APP_URL()}/api/vapi/webhook` },
  };
}

export function agentTools() {
  return [
    // --- Agenda (Google Calendar) ---
    serverTool(
      "list_events",
      "Liste les rendez-vous de l'agenda de l'utilisateur pour un jour donné.",
      { day: { type: "string", description: "Jour demandé au format AAAA-MM-JJ, ou 'today'/'tomorrow'" } },
      ["day"],
    ),
    serverTool(
      "create_event",
      "PROPOSE un nouveau rendez-vous dans l'agenda. Si confirmed=false, renvoie une proposition à lire à voix haute. Ne passe confirmed=true qu'après un 'oui' explicite de l'utilisateur.",
      {
        title: { type: "string", description: "Titre du rendez-vous" },
        start: { type: "string", description: "Début au format ISO 8601, ex: 2026-07-15T14:00:00" },
        duration_minutes: { type: "number", description: "Durée en minutes (60 par défaut)" },
        confirmed: { type: "boolean", description: "true uniquement après confirmation orale explicite" },
      },
      ["title", "start", "confirmed"],
    ),
    serverTool(
      "move_event",
      "PROPOSE de déplacer un rendez-vous existant. Même règle de confirmation que create_event.",
      {
        event_query: { type: "string", description: "Mots du titre ou moment du rendez-vous à déplacer" },
        new_start: { type: "string", description: "Nouveau début, format ISO 8601" },
        confirmed: { type: "boolean" },
      },
      ["event_query", "new_start", "confirmed"],
    ),

    // --- Rappels ---
    serverTool(
      "set_reminder",
      "Programme un rappel qui sera envoyé par SMS (ou rappel vocal) au moment voulu.",
      {
        text: { type: "string", description: "Texte du rappel, ex: 'prendre le médicament du soir'" },
        due_at: { type: "string", description: "Quand, format ISO 8601" },
        recurrence: { type: "string", enum: ["none", "daily", "weekly", "monthly"], description: "Récurrence" },
      },
      ["text", "due_at"],
    ),
    serverTool("list_reminders", "Liste les rappels à venir de l'utilisateur.", {}),
    serverTool(
      "did_i_already",
      "Répond à « est-ce que j'ai déjà fait X aujourd'hui ? » en consultant les rappels marqués faits.",
      { what: { type: "string", description: "L'action demandée, ex: 'pris mes médicaments'" } },
      ["what"],
    ),
    serverTool(
      "mark_done",
      "Marque une action/rappel comme fait (ex: l'utilisateur dit qu'il vient de prendre son médicament).",
      { what: { type: "string" } },
      ["what"],
    ),

    // --- Météo ---
    serverTool(
      "get_weather",
      "Donne la météo pour une ville (aujourd'hui ou demain).",
      {
        city: { type: "string", description: "Ville. Si absent, utiliser la ville du domicile." },
        day: { type: "string", enum: ["today", "tomorrow"], description: "Jour" },
      },
    ),

    // --- Navigation par SMS ---
    serverTool(
      "get_directions",
      "Calcule un itinéraire et envoie les étapes par SMS à l'utilisateur, en plus du résumé vocal.",
      {
        destination: { type: "string", description: "Adresse ou lieu d'arrivée" },
        origin: { type: "string", description: "Point de départ. Si absent : demander « où êtes-vous ? » ou utiliser le domicile." },
        mode: { type: "string", enum: ["walking", "driving", "transit"], description: "Mode de déplacement" },
      },
      ["destination"],
    ),

    // --- Contacts ---
    serverTool(
      "find_contact",
      "Cherche un contact (téléphone) dans le carnet d'adresses Google de l'utilisateur.",
      { name: { type: "string", description: "Nom ou surnom du contact" } },
      ["name"],
    ),

    // --- Messages ---
    serverTool(
      "send_sms",
      "PROPOSE d'envoyer un SMS dicté. Si confirmed=false : renvoie le texte à relire à voix haute. confirmed=true seulement après 'oui' explicite. Action sensible : nécessite le PIN vérifié.",
      {
        to_name: { type: "string", description: "Nom du destinataire (sera résolu via les contacts)" },
        to_number: { type: "string", description: "Ou numéro E.164 direct" },
        body: { type: "string", description: "Texte du message dicté" },
        confirmed: { type: "boolean" },
      },
      ["body", "confirmed"],
    ),

    // --- Appels sortants (Docteur / Taxi / Résa) ---
    serverTool(
      "place_call",
      "PROPOSE de passer un appel à la place de l'utilisateur (médecin, taxi, restaurant…). Si confirmed=false : renvoie un récapitulatif de la mission à lire. confirmed=true seulement après 'oui' explicite. Action sensible : nécessite le PIN vérifié. Le résultat sera envoyé par SMS.",
      {
        kind: { type: "string", enum: ["docteur", "taxi", "resto", "generic"], description: "Type de mission" },
        goal: { type: "string", description: "Objectif précis en français, ex: 'prendre un rendez-vous chez le Dr Martin cette semaine, plutôt le matin'" },
        target_name: { type: "string", description: "Nom de l'établissement/la personne à appeler" },
        target_number: { type: "string", description: "Numéro à appeler si connu (sinon il sera cherché dans les contacts/mémoire)" },
        constraints: { type: "string", description: "Contraintes utiles : créneaux, nombre de personnes, adresse de prise en charge…" },
        confirmed: { type: "boolean" },
      },
      ["kind", "goal", "confirmed"],
    ),

    // --- Mémoire ---
    serverTool(
      "remember",
      "Retient une information durable sur l'utilisateur (ex: 'mon médecin traitant est le Dr Martin, 01 23 45 67 89').",
      {
        key: { type: "string", description: "Sujet court, ex: 'médecin traitant'" },
        value: { type: "string", description: "L'information à retenir" },
      },
      ["key", "value"],
    ),
    serverTool(
      "recall",
      "Recherche dans la mémoire de l'utilisateur (lieux, personnes, préférences déjà notées).",
      { query: { type: "string", description: "Ce qu'on cherche" } },
      ["query"],
    ),

    // --- Sécurité ---
    serverTool(
      "verify_pin",
      "Vérifie le code PIN parlé de l'utilisateur. Obligatoire avant toute action sensible (envoyer un message, passer un appel). Ne JAMAIS répéter le PIN à voix haute.",
      { pin: { type: "string", description: "Le code à 4 chiffres dicté" } },
      ["pin"],
    ),
  ];
}
