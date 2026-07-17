"use server";

// Server Actions de l'onboarding : téléphone (OTP) -> Google -> consentements.

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { siteLanguage } from "@/lib/site-i18n";
import { checkPhoneVerification, startPhoneVerification } from "@/lib/twilio";
import { CONSENT_SOURCES, ONBOARDING } from "./copy";

async function currentUserId(): Promise<string> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  return user.id;
}

function normalizeFrenchPhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s.\-()]/g, "");
  if (/^\+33[67]\d{8}$/.test(cleaned) || /^\+33[1-9]\d{8}$/.test(cleaned)) return cleaned;
  if (/^0[1-9]\d{8}$/.test(cleaned)) return `+33${cleaned.slice(1)}`;
  if (/^\+\d{8,15}$/.test(cleaned)) return cleaned; // autre pays, toléré
  return null;
}

export async function sendOtp(_prev: unknown, formData: FormData): Promise<{ ok: boolean; message: string; e164?: string }> {
  await currentUserId();
  const errors = ONBOARDING[await siteLanguage()].errors;
  const e164 = normalizeFrenchPhone(String(formData.get("phone") ?? ""));
  if (!e164) return { ok: false, message: errors.invalidNumber };
  try {
    await startPhoneVerification(e164);
  } catch (err) {
    console.error("OTP send", err);
    return { ok: false, message: errors.sendFailed };
  }
  // On enregistre au passage l'identité saisie dans le même formulaire : il n'y a
  // plus de bouton « Enregistrer » séparé. Ces champs restent modifiables ensuite
  // dans « Mon agent ».
  await saveIdentity(formData);
  return { ok: true, message: errors.codeSent, e164 };
}

export async function confirmOtp(_prev: unknown, formData: FormData): Promise<{ ok: boolean; message: string }> {
  const userId = await currentUserId();
  const errors = ONBOARDING[await siteLanguage()].errors;
  const e164 = String(formData.get("e164") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  try {
    const ok = await checkPhoneVerification(e164, code);
    if (!ok) return { ok: false, message: errors.wrongCode };
  } catch {
    return { ok: false, message: errors.verifyFailed };
  }
  const db = supabaseAdmin();
  await db.from("phones").upsert(
    { user_id: userId, e164, verified_at: new Date().toISOString() },
    { onConflict: "e164" },
  );
  await db.from("profiles").update({ onboarding_step: "google" }).eq("id", userId);
  return { ok: true, message: errors.verified };
}

export async function saveIdentity(formData: FormData): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin()
    .from("profiles")
    .update({
      full_name: String(formData.get("full_name") ?? "").trim() || null,
      preferred_name: String(formData.get("preferred_name") ?? "").trim() || null,
      home_address: String(formData.get("home_address") ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
}

export async function skipPhone(formData: FormData): Promise<void> {
  // Aucun téléphone à relier pour l'instant : on enregistre l'identité déjà
  // saisie et on avance sans vérification SMS. Le numéro pourra être ajouté plus
  // tard depuis « Compte ». Sans cette sortie, l'onboarding bloque l'accès à
  // l'espace tant qu'un code SMS n'est pas reçu — impossible sans téléphone.
  const userId = await currentUserId();
  await saveIdentity(formData);
  await supabaseAdmin().from("profiles").update({ onboarding_step: "google" }).eq("id", userId);
  redirect("/onboarding");
}

export async function skipGoogle(): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin().from("profiles").update({ onboarding_step: "consents" }).eq("id", userId);
  redirect("/onboarding");
}

export async function saveConsents(formData: FormData): Promise<void> {
  const userId = await currentUserId();
  // scope_note = le libellé réellement montré, dans la langue du site au moment
  // du choix : le registre garde la phrase cochée, pas une traduction d'office.
  const labels = ONBOARDING[await siteLanguage()].consents.labels;
  const rows = CONSENT_SOURCES.map((source) => ({
    user_id: userId,
    source,
    granted: formData.get(source) === "on",
    scope_note: labels[source],
  }));
  const db = supabaseAdmin();
  await db.from("consents").insert(rows);
  // Plus d'étape PIN : l'auth en appel se fait par code jetable (SMS) au moment voulu.
  await db.from("profiles").update({ onboarding_step: "done" }).eq("id", userId);
  redirect("/tableau-de-bord");
}
