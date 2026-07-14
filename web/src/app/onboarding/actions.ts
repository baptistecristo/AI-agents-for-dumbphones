"use server";

// Server Actions de l'onboarding : téléphone (OTP) -> Google -> consentements.

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { checkPhoneVerification, startPhoneVerification } from "@/lib/twilio";

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
  const e164 = normalizeFrenchPhone(String(formData.get("phone") ?? ""));
  if (!e164) return { ok: false, message: "Numéro invalide. Exemple : 06 12 34 56 78" };
  try {
    await startPhoneVerification(e164);
    return { ok: true, message: "Code envoyé par SMS.", e164 };
  } catch (err) {
    console.error("OTP send", err);
    return { ok: false, message: "Impossible d'envoyer le code (service SMS). Réessaie." };
  }
}

export async function confirmOtp(_prev: unknown, formData: FormData): Promise<{ ok: boolean; message: string }> {
  const userId = await currentUserId();
  const e164 = String(formData.get("e164") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  try {
    const ok = await checkPhoneVerification(e164, code);
    if (!ok) return { ok: false, message: "Code incorrect. Réessaie." };
  } catch {
    return { ok: false, message: "Vérification impossible. Redemande un code." };
  }
  const db = supabaseAdmin();
  await db.from("phones").upsert(
    { user_id: userId, e164, verified_at: new Date().toISOString() },
    { onConflict: "e164" },
  );
  await db.from("profiles").update({ onboarding_step: "google" }).eq("id", userId);
  return { ok: true, message: "Numéro vérifié ✅" };
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

export async function skipGoogle(): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin().from("profiles").update({ onboarding_step: "consents" }).eq("id", userId);
  redirect("/onboarding");
}

const CONSENT_LABELS: Record<string, string> = {
  calendar: "Lire et modifier l'agenda",
  contacts: "Lire les contacts",
  sms: "Envoyer des SMS (rappels, itinéraires, comptes-rendus)",
  outbound_calls: "Passer des appels à ma place (restaurant, taxi, rendez-vous)",
  memory: "Retenir mes préférences (lieux, personnes, habitudes)",
  recording: "Enregistrer et transcrire les appels pour le suivi",
};

export async function saveConsents(formData: FormData): Promise<void> {
  const userId = await currentUserId();
  const rows = Object.keys(CONSENT_LABELS).map((source) => ({
    user_id: userId,
    source,
    granted: formData.get(source) === "on",
    scope_note: CONSENT_LABELS[source],
  }));
  const db = supabaseAdmin();
  await db.from("consents").insert(rows);
  // Plus d'étape PIN : l'auth en appel se fait par code jetable (SMS) au moment voulu.
  await db.from("profiles").update({ onboarding_step: "done" }).eq("id", userId);
  redirect("/tableau-de-bord");
}
