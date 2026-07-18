// PIN du canal texte — le code court que la personne règle dans son tableau de
// bord et envoie par SMS pour débloquer les ÉCRITURES (envoyer un SMS, passer un
// appel, toucher à l'agenda…). Les lectures par SMS ne l'exigent pas : la réponse
// ne part qu'au numéro enregistré (cf. skills/gate.ts).
//
// Pourquoi un PIN réglé d'avance plutôt que le code jetable de la voix (auth.ts) ?
// Un code jetable a besoin d'un appel pour vivre (un début, une fin) ; par SMS il
// n'y en a pas. Et l'envoyer suppose un SMS SORTANT, absent de cette instance. Un
// PIN connu de la personne n'a rien à envoyer : elle le tape, on le vérifie.
//
// Un PIN à 3 chiffres n'a que 1000 valeurs. Le hash ne protège donc quasiment
// rien contre la force brute — la vraie défense est la LIMITE DE TENTATIVES
// (text_sessions.failed_attempts / locked_until), pas la solidité du hash. Le
// hash keyé garde seulement les 3 chiffres hors de portée d'une fuite de la base
// seule. (4 à 6 chiffres seraient nettement plus solides si on veut durcir.)

import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { supabaseAdmin } from "./supabase/admin";

export const PIN_LENGTH = 3;
const MAX_ATTEMPTS = 5; // au-delà, verrouillage temporaire
const LOCK_MINUTES = 15;
const VERIFIED_MINUTES = 15; // durée du déverrouillage après un PIN correct

// Exactement N chiffres, rien d'autre. Le tableau de bord valide côté client,
// mais c'est ici que ça fait autorité.
export function isValidPinFormat(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

// HMAC-SHA256 keyé par ENCRYPTION_KEY (jamais le PIN en clair en base).
function hashPin(pin: string): string {
  const keyBytes = Buffer.from(env("ENCRYPTION_KEY"), "base64");
  return createHmac("sha256", keyBytes).update(pin, "utf8").digest("hex");
}

export class InvalidPinError extends Error {
  constructor() {
    super(`Le PIN doit faire exactement ${PIN_LENGTH} chiffres.`);
    this.name = "InvalidPinError";
  }
}

// Pose ou change le PIN texte (appelé par l'action du tableau de bord).
export async function setTextPin(userId: string, pin: string): Promise<void> {
  if (!isValidPinFormat(pin)) throw new InvalidPinError();
  const { error } = await supabaseAdmin().from("profiles").update({ text_pin_hash: hashPin(pin) }).eq("id", userId);
  if (error) throw new Error(`Écriture du PIN impossible : ${error.message}`);
}

// Retire le PIN : les écritures par SMS redeviennent impossibles.
export async function clearTextPin(userId: string): Promise<void> {
  const { error } = await supabaseAdmin().from("profiles").update({ text_pin_hash: null }).eq("id", userId);
  if (error) throw new Error(`Suppression du PIN impossible : ${error.message}`);
}

export async function userHasTextPin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from("profiles").select("text_pin_hash").eq("id", userId).maybeSingle();
  return Boolean(data?.text_pin_hash);
}

// Le fil est-il déjà déverrouillé (PIN validé récemment, non expiré) ?
export async function loadTextVerified(userId: string, e164: string): Promise<boolean> {
  const { data } = await supabaseAdmin()
    .from("text_sessions")
    .select("verified_until")
    .eq("user_id", userId)
    .eq("e164", e164)
    .maybeSingle();
  return Boolean(data?.verified_until && new Date(data.verified_until).getTime() > Date.now());
}

export type PinResult = "ok" | "wrong" | "locked" | "no_pin";

// Vérifie un PIN reçu par SMS. Comparaison en temps constant, limite de
// tentatives persistée dans text_sessions.
export async function verifyTextPin(userId: string, e164: string, pin: string): Promise<PinResult> {
  const db = supabaseAdmin();
  const now = Date.now();

  const { data: sess } = await db
    .from("text_sessions")
    .select("failed_attempts, locked_until, verified_until")
    .eq("user_id", userId)
    .eq("e164", e164)
    .maybeSingle();

  if (sess?.locked_until && new Date(sess.locked_until).getTime() > now) return "locked";

  const { data: profile } = await db.from("profiles").select("text_pin_hash").eq("id", userId).maybeSingle();
  if (!profile?.text_pin_hash) return "no_pin";

  const provided = Buffer.from(hashPin((pin ?? "").replace(/\D/g, "")), "hex");
  const expected = Buffer.from(profile.text_pin_hash, "hex");
  const match = provided.length === expected.length && timingSafeEqual(provided, expected);

  if (match) {
    await db.from("text_sessions").upsert(
      {
        user_id: userId,
        e164,
        verified_until: new Date(now + VERIFIED_MINUTES * 60_000).toISOString(),
        failed_attempts: 0,
        locked_until: null,
        updated_at: new Date(now).toISOString(),
      },
      { onConflict: "user_id,e164" },
    );
    return "ok";
  }

  const failed = (sess?.failed_attempts ?? 0) + 1;
  const locked = failed >= MAX_ATTEMPTS ? new Date(now + LOCK_MINUTES * 60_000).toISOString() : null;
  await db.from("text_sessions").upsert(
    {
      user_id: userId,
      e164,
      verified_until: sess?.verified_until ?? null,
      failed_attempts: failed,
      locked_until: locked,
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: "user_id,e164" },
  );
  return locked ? "locked" : "wrong";
}
