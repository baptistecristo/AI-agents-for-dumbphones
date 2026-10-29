// Téléphonie SMS + vérification de numéro (Twilio).
// Le doc d'archi permet Telnyx/OVH plus tard : tout passe par ces 3 fonctions,
// changer de fournisseur = réécrire ce seul fichier.

import twilio from "twilio";
import { env } from "./env";
import { supabaseAdmin } from "./supabase/admin";

function client() {
  return twilio(env("TWILIO_ACCOUNT_SID"), env("TWILIO_AUTH_TOKEN"));
}

// Pilote d'envoi. « twilio » (défaut) envoie vraiment ; « log » — dev et démo,
// jamais la prod — n'envoie rien : sendSms écrit le message complet dans les
// logs du serveur et répond comme si l'envoi avait réussi, pour que les skills
// à livraison SMS (itinéraire, SMS dicté, rappels) aillent au bout sans compte
// Twilio. Le chemin « verify » n'est PAS couvert : un code jetable simulé
// n'authentifie personne, il n'y a rien d'honnête à simuler là.
function smsDriver(): "twilio" | "log" {
  return process.env.SMS_DRIVER === "log" ? "log" : "twilio";
}

// Y a-t-il un fournisseur SMS branché ? On lit process.env directement, PAS env()
// qui lève : c'est justement ce prédicat qui sert à décider avant de lever.
// Sans lui, une instance sans compte Twilio refuse tout en silence et la personne
// au bout du fil attend un code qui ne partira jamais.
// Deux chemins, qui peuvent être configurés séparément : « verify » (code
// jetable) et « send » (SMS sortant).
export function smsProviderConfigured(path: "verify" | "send" = "send"): boolean {
  if (path === "send" && smsDriver() === "log") return true;
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return false;
  return path === "verify" ? Boolean(process.env.TWILIO_VERIFY_SERVICE_SID) : Boolean(process.env.TWILIO_FROM_NUMBER);
}

// Trace opérateur. Côté appelant le refus reste poli ; côté logs il doit être
// sans ambiguïté : ce n'est pas une panne, il manque une configuration.
export function warnSmsProviderMissing(context: string): void {
  console.warn(
    `[sms] Aucun fournisseur SMS branché (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, TWILIO_VERIFY_SERVICE_SID) — abandonné : ${context}`,
  );
}

// Erreur nommée : les appelants qui n'ont personne à qui parler (cron) doivent
// pouvoir distinguer « rien de branché » d'une panne réseau Twilio, dans les
// logs comme dans un catch.
export class SmsProviderNotConfiguredError extends Error {
  constructor(context: string) {
    super(`Aucun fournisseur SMS branché : ${context} impossible.`);
    this.name = "SmsProviderNotConfiguredError";
  }
}

export async function sendSms(opts: {
  to: string;
  body: string;
  userId?: string;
  kind?: string;
}): Promise<void> {
  const kind = opts.kind ?? "generic";
  // Pilote « log » : le message est complet dans les logs, rien ne part, et pas
  // de ligne sms_logs — cette table ne raconte que de vrais envois.
  if (smsDriver() === "log") {
    console.info(`[sms] SMS_DRIVER=log — rien n'est parti. « ${kind} » vers ${opts.to} : ${opts.body}`);
    return;
  }
  // Garde-fou de dernier recours : les appelants qui parlent à quelqu'un testent
  // smsProviderConfigured() en amont pour le lui dire. Ici on évite surtout le
  // « Variable d'environnement manquante » nu, illisible dans les logs.
  if (!smsProviderConfigured("send")) {
    warnSmsProviderMissing(`SMS « ${kind} » vers ${opts.to}`);
    throw new SmsProviderNotConfiguredError(`envoi du SMS « ${kind} »`);
  }
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
    kind,
  });
}

// Vérification du numéro à l'onboarding (SMS OTP via Twilio Verify)
export async function startPhoneVerification(e164: string): Promise<void> {
  if (!smsProviderConfigured("verify")) {
    warnSmsProviderMissing("code de vérification (Twilio Verify)");
    throw new SmsProviderNotConfiguredError("envoi du code de vérification");
  }
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
