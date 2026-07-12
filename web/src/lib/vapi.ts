// Client Vapi (plateforme voix managée — choix A du doc d'archi).
// Règle "provider-agnostic" : seul ce fichier et src/lib/agents/* connaissent
// Vapi. Migrer vers LiveKit/Pipecat plus tard = remplacer ces appels REST.

import { timingSafeEqual } from "node:crypto";

import { env, envOr } from "./env";

const VAPI_BASE = "https://api.vapi.ai";

async function vapiFetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env("VAPI_API_KEY")}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Vapi ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// Lance un appel sortant (moteur Docteur/Taxi/Résa).
// assistant est passé "inline" (transient) : pas besoin de pré-créer côté Vapi.
export async function startOutboundCall(opts: {
  toNumber: string;
  assistant: Record<string, unknown>;
  metadata?: Record<string, string>;
}): Promise<{ id: string }> {
  const body = {
    phoneNumberId: env("VAPI_PHONE_NUMBER_ID"),
    customer: { number: opts.toNumber },
    assistant: opts.assistant,
    metadata: opts.metadata,
  };
  return (await vapiFetch("/call", { method: "POST", body: JSON.stringify(body) })) as { id: string };
}

export async function upsertAssistant(
  assistantId: string | undefined,
  config: Record<string, unknown>,
): Promise<{ id: string }> {
  if (assistantId) {
    return (await vapiFetch(`/assistant/${assistantId}`, {
      method: "PATCH",
      body: JSON.stringify(config),
    })) as { id: string };
  }
  return (await vapiFetch("/assistant", { method: "POST", body: JSON.stringify(config) })) as { id: string };
}

// Branche un numéro de téléphone Vapi sur notre webhook (assistant-request) :
// chaque appel entrant reçoit alors un assistant personnalisé (mémoire, prénom).
export async function attachPhoneNumber(phoneNumberId: string, fallbackAssistantId?: string): Promise<void> {
  await vapiFetch(`/phone-number/${phoneNumberId}`, {
    method: "PATCH",
    body: JSON.stringify({
      server: { url: `${envOr("APP_URL", "http://localhost:3000")}/api/vapi/webhook` },
      ...(fallbackAssistantId ? { fallbackDestination: undefined, assistantId: fallbackAssistantId } : {}),
    }),
  });
}

// Vérification d'authenticité des webhooks Vapi (header x-vapi-secret)
export function isValidVapiRequest(req: Request): boolean {
  const secret = envOr("VAPI_WEBHOOK_SECRET", "");
  if (!secret) {
    // Secret absent : toléré uniquement hors production, jamais en prod.
    return process.env.NODE_ENV !== "production";
  }
  const provided = Buffer.from(req.headers.get("x-vapi-secret") ?? "");
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
