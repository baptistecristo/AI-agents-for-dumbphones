// Moteur d'appels sortants généralisé (§7 du doc d'archi).
// Un seul moteur, des "presets" par mission : Docteur, Taxi, Restaurant, générique.
// L'agent appelle un humain (secrétariat, central taxi…), navigue les serveurs
// vocaux (DTMF), gère le répondeur, poursuit un objectif borné, puis rend
// compte via l'outil report_outcome -> SMS à l'utilisateur.

import { APP_URL, envOr } from "../env";

export type OutboundJob = {
  id: string;
  kind: "docteur" | "taxi" | "resto" | "generic";
  goal: string;
  target_name: string | null;
  target_number: string;
  constraints: Record<string, unknown>;
  callback_number: string;
  user_full_name: string | null;
};

const KIND_GUIDANCE: Record<OutboundJob["kind"], string> = {
  docteur: `# Mission type : cabinet médical
- Tu appelles un cabinet médical pour prendre, déplacer ou confirmer un rendez-vous.
- Serveur vocal : écoute les options et utilise l'outil dtmf pour taper le bon chiffre (souvent « secrétariat » ou « rendez-vous »).
- Avec la secrétaire : donne le nom du patient, la raison EN UN MOT (consultation, renouvellement…), et les disponibilités. Ne révèle AUCUN détail médical au-delà du strict nécessaire.
- Note précisément : date, heure, praticien, consignes (à jeun, carte vitale…).
- Répondeur : laisse un message bref — nom du patient, demande de rendez-vous, numéro de rappel — puis report_outcome avec status "voicemail".`,
  taxi: `# Mission type : réservation de taxi
- Tu appelles une compagnie de taxi ou un chauffeur pour réserver une course.
- Donne : adresse de prise en charge, destination, horaire, nom du client.
- IMPORTANT : demande à ce que le chauffeur appelle DIRECTEMENT le client à son arrivée, au numéro de rappel fourni. C'est le téléphone personnel du client : le chauffeur doit l'utiliser plutôt que d'attendre devant la porte.
- Confirme le prix approximatif si proposé, sans jamais t'engager sur un paiement.`,
  resto: `# Mission type : réservation de restaurant
- Tu appelles un restaurant pour réserver une table.
- Donne : nombre de personnes, date et heure, nom pour la réservation.
- Si le créneau n'est pas disponible, essaie ±30 minutes autour, dans les contraintes données. Au-delà, ne décide pas à la place du client : report_outcome avec status "needs_user".`,
  generic: `# Mission type : appel général
- Tu poursuis exactement l'objectif donné, rien de plus.
- Tout ce qui engagerait le client au-delà de l'objectif (paiement, abonnement, engagement) : refuse poliment et report_outcome avec status "needs_user".`,
};

export function outboundSystemPrompt(job: OutboundJob): string {
  const clientName = job.user_full_name ?? "le client";
  return `Tu es un assistant téléphonique qui appelle POUR LE COMPTE de ${clientName}. Tu parles français, poliment et efficacement.

# Transparence (obligation légale)
Dès le début : « Bonjour, je suis l'assistant automatique de ${clientName}, je vous appelle de sa part. » Ne te fais JAMAIS passer pour un humain si on te pose la question.

# Objectif de cet appel
${job.goal}
${job.target_name ? `Interlocuteur attendu : ${job.target_name}` : ""}
Contraintes : ${JSON.stringify(job.constraints)}
Numéro de rappel du client (à communiquer si utile) : ${job.callback_number}

${KIND_GUIDANCE[job.kind]}

# Règles générales
- Une mission = cet objectif, RIEN d'autre. Tu ne donnes aucune information personnelle du client au-delà du nécessaire (jamais d'adresse complète sauf si la mission l'exige, jamais de données bancaires — tu n'en as pas).
- Serveur vocal : utilise l'outil dtmf (« tapez 1 » → dtmf "1").
- Si on te met en attente, patiente calmement.
- Si l'interlocuteur te demande quelque chose que tu ne sais pas, dis que tu vas vérifier et que le client rappellera : ne INVENTE jamais.
- Impasse (refus, fermé, mauvais numéro, on te raccroche au nez) : n'insiste pas. report_outcome avec le bon statut, puis termine l'appel avec endCall.
- Dès que l'objectif est atteint : récapitule à l'interlocuteur (« Donc c'est noté : … »), remercie, appelle report_outcome avec status "success" et TOUS les détails, puis endCall.

# Ce que tu rapportes (report_outcome)
- status: success | failed | voicemail | needs_user
- details: tout ce que le client doit savoir, en français clair (date, heure, nom, prix, consignes). C'est ce texte qui lui sera envoyé par SMS : rédige-le pour lui.`;
}

export function buildOutboundAssistant(job: OutboundJob) {
  const serverUrl = `${APP_URL()}/api/vapi/webhook`;
  return {
    name: `mission-${job.kind}-${job.id.slice(0, 8)}`,
    voice: {
      provider: "11labs",
      voiceId: envOr("ELEVENLABS_VOICE_ID", "pNInz6obpgDQGcFmaJgB"),
      model: "eleven_multilingual_v2",
      speed: 1.0, // débit normal : ici on parle à un professionnel, pas au senior
    },
    transcriber: { provider: "deepgram", model: "nova-2", language: "fr" },
    model: {
      // Le planificateur d'appels sortants mérite le modèle fort (§3 du doc :
      // deux niveaux de modèle ; ici c'est le cas "hard reasoning").
      provider: envOr("AGENT_MODEL_PROVIDER", "anthropic"),
      model: envOr("OUTBOUND_MODEL", "claude-sonnet-5"),
      temperature: 0.3,
      messages: [{ role: "system", content: outboundSystemPrompt(job) }],
      tools: [
        { type: "dtmf" },
        { type: "endCall" },
        {
          type: "function",
          async: false,
          function: {
            name: "report_outcome",
            description:
              "Rapporte le résultat final de la mission. À appeler UNE fois, avant de raccrocher.",
            parameters: {
              type: "object",
              properties: {
                status: { type: "string", enum: ["success", "failed", "voicemail", "needs_user"] },
                details: {
                  type: "string",
                  description: "Compte-rendu en français destiné au client (sera envoyé par SMS).",
                },
              },
              required: ["status", "details"],
            },
          },
          server: { url: serverUrl },
        },
      ],
    },
    voicemailDetection: { provider: "twilio" },
    firstMessageMode: "assistant-waits-for-user",
    silenceTimeoutSeconds: 20,
    maxDurationSeconds: 600,
    server: { url: serverUrl },
    serverMessages: ["tool-calls", "end-of-call-report", "status-update"],
    metadata: { outbound_job_id: job.id },
  };
}
