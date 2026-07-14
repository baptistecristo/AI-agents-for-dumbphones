// Téléphonie SMS + vérification de numéro (Twilio).
// Le doc d'archi permet Telnyx/OVH plus tard : tout passe par ces 3 fonctions,
// changer de fournisseur = réécrire ce seul fichier.

import twilio from "twilio";
import { env } from "./env";
import { supabaseAdmin } from "./supabase/admin";

function client() {
  return twilio(env("TWILIO_ACCOUNT_SID"), env("TWILIO_AUTH_TOKEN"));
}

export async function sendSms(opts: {
  to: string;
  body: string;
  userId?: string;
  kind?: string;
}): Promise<void> {
  await client().messages.create({
    to: opts.to,
    from: env("TWILIO_FROM_NUMBER"),
    body: opts.body,
  });
  await supabaseAdmin().from("sms_logs").insert({
    user_id: opts.userId ?? null,
    direction: "outbound",
    e164: opts.to,
    body: opts.body,
    kind: opts.kind ?? "generic",
  });
}

// Vérification du numéro à l'onboarding (SMS OTP via Twilio Verify)
export async function startPhoneVerification(e164: string): Promise<void> {
  await client()
    .verify.v2.services(env("TWILIO_VERIFY_SERVICE_SID"))
    .verifications.create({ to: e164, channel: "sms" });
}

export async function checkPhoneVerification(e164: string, code: string): Promise<boolean> {
  const check = await client()
    .verify.v2.services(env("TWILIO_VERIFY_SERVICE_SID"))
    .verificationChecks.create({ to: e164, code });
  return check.status === "approved";
}
