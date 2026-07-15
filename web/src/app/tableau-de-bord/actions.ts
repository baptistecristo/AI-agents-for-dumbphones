"use server";

// Actions du tableau de bord : consentements révocables + déconnexion.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clampVoiceSpeed } from "@/lib/agents/inbound";
import { normalizeLanguage } from "@/lib/language";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export async function toggleConsent(formData: FormData): Promise<void> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const source = String(formData.get("source"));
  const granted = formData.get("granted") === "true";
  await supabaseAdmin().from("consents").insert({
    user_id: user.id,
    source,
    granted,
    scope_note: `Modifié depuis le tableau de bord`,
  });
  revalidatePath("/tableau-de-bord");
}

export async function updatePersonalization(formData: FormData): Promise<void> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const preferredName = String(formData.get("preferred_name") ?? "").trim();
  const homeAddress = String(formData.get("home_address") ?? "").trim();
  // Le formulaire n'est pas une source de confiance : ces deux réglages partent
  // dans la config d'appel, donc on les repasse par la seule voie autorisée.
  // La langue retombe sur 'fr' si ce n'est pas exactement 'en' (colonne not
  // null), et le débit est borné à la plage ElevenLabs — sans ça, un POST
  // bricolé (« voice_speed=9 ») rendrait tous les appels suivants impossibles.
  // Un champ ABSENT, lui, ne veut pas dire « remets le défaut » : une server
  // action est une URL publique, et ce qui arrive ici n'est pas forcément le
  // formulaire du tableau de bord. Un POST qui omet preferred_language
  // repasserait sinon un anglophone en français sans que personne n'ait touché
  // au réglage. On n'écrit que ce qui a été soumis.
  const rawLanguage = formData.get("preferred_language");
  const rawVoiceSpeed = formData.get("voice_speed");
  await supabaseAdmin()
    .from("profiles")
    .update({
      preferred_name: preferredName || null,
      home_address: homeAddress || null,
      ...(rawLanguage === null ? {} : { preferred_language: normalizeLanguage(String(rawLanguage)) }),
      ...(rawVoiceSpeed === null ? {} : { voice_speed: clampVoiceSpeed(rawVoiceSpeed) }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  revalidatePath("/tableau-de-bord");
}

export async function signOut(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/");
}
