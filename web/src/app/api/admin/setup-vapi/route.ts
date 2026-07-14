// Provisioning Vapi en un appel (protégé par CRON_SECRET) :
//   curl -X POST https://votre-app/api/admin/setup-vapi -H "Authorization: Bearer $CRON_SECRET"
// 1. Crée/actualise l'assistant entrant persistant (fallback).
// 2. Si VAPI_PHONE_NUMBER_ID est défini : branche le numéro sur notre webhook
//    (assistant-request), pour un assistant personnalisé à chaque appel.
// À relancer après tout changement de prompt/outils, et le jour où le numéro
// de téléphone est acheté.

import { NextResponse } from "next/server";
import { buildInboundAssistant } from "@/lib/agents/inbound";
import { env, envOr } from "@/lib/env";
import { defaultLanguage } from "@/lib/language";
import { attachPhoneNumber, upsertAssistant } from "@/lib/vapi";

export async function POST(req: Request) {
  const secret = env("CRON_SECRET");
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }

  // Assistant générique (l'assistant-request personnalise à chaque appel)
  const generic = buildInboundAssistant({
    userId: null,
    preferredName: null,
    homeAddress: null,
    memories: [],
    pinConfigured: false,
    language: defaultLanguage(),
  });

  const assistant = await upsertAssistant(envOr("VAPI_ASSISTANT_ID", "") || undefined, generic);

  const phoneNumberId = envOr("VAPI_PHONE_NUMBER_ID", "");
  let phoneAttached = false;
  if (phoneNumberId) {
    await attachPhoneNumber(phoneNumberId, assistant.id);
    phoneAttached = true;
  }

  return NextResponse.json({
    assistantId: assistant.id,
    phoneAttached,
    note: phoneAttached
      ? "Numéro branché : les appels entrants passent par /api/vapi/webhook."
      : "Pas de VAPI_PHONE_NUMBER_ID : ajoutez-le quand le numéro sera acheté, puis relancez.",
    rappel: `Ajoutez VAPI_ASSISTANT_ID=${assistant.id} aux variables d'environnement pour les prochaines mises à jour.`,
  });
}
