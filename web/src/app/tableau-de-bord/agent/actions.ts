"use server";

// Réglages de l'agent : prénom, nom, langue, débit, adresse « chez moi », et les
// consignes libres. Le formulaire n'est pas une source de confiance — une server
// action est une URL publique — donc chaque valeur repasse par la seule voie
// autorisée : la langue retombe sur 'fr' si ce n'est pas 'en', le débit est borné
// à la plage ElevenLabs, et un champ ABSENT ne veut pas dire « remets le défaut »
// (on n'écrit que ce qui a été soumis).

import { redirect } from "next/navigation";
import { clampVoiceSpeed } from "@/lib/agents/inbound";
import { normalizeLanguage } from "@/lib/language";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { clearTextPin, isValidPinFormat, setTextPin } from "@/lib/text-pin";

// On stocke un peu plus que ce que le prompt lit (800), pour ne pas tronquer en
// base sous les yeux de la personne. Le prompt borne à nouveau à l'usage.
const AGENT_INSTRUCTIONS_STORE_MAX = 1000;

export async function updatePersonalization(formData: FormData): Promise<void> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const field = (name: string) => String(formData.get(name) ?? "").trim();
  const rawLanguage = formData.get("preferred_language");
  const rawVoiceSpeed = formData.get("voice_speed");

  const db = supabaseAdmin();
  await db
    .from("profiles")
    .update({
      preferred_name: field("preferred_name") || null,
      full_name: field("full_name") || null,
      home_address: field("home_address") || null,
      ...(rawLanguage === null ? {} : { preferred_language: normalizeLanguage(String(rawLanguage)) }),
      ...(rawVoiceSpeed === null ? {} : { voice_speed: clampVoiceSpeed(rawVoiceSpeed) }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  // Consignes libres : écriture séparée et tolérante. Si 0009 n'est pas encore
  // appliqué, la colonne manque — cette voie échoue seule, sans emporter le
  // reste du formulaire. Un champ absent (POST bricolé) ne réécrit rien.
  const rawInstructions = formData.get("agent_instructions");
  if (rawInstructions !== null) {
    const instructions = String(rawInstructions).trim().slice(0, AGENT_INSTRUCTIONS_STORE_MAX);
    const { error } = await db
      .from("profiles")
      .update({ agent_instructions: instructions || null })
      .eq("id", user.id);
    if (error) console.warn("agent_instructions non enregistré (migration 0009 appliquée ?) :", error.message);
  }

  redirect("/tableau-de-bord/agent?enregistre=1");
}

// PIN du canal texte : le code court qui débloque les ÉCRITURES par SMS. Deux
// boutons — « Enregistrer » (défaut) et « Retirer » (action=clear). On ne wrappe
// jamais redirect() dans le try : il fonctionne en LEVANT, un catch l'avalerait.
export async function updateTextPin(formData: FormData): Promise<void> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  let outcome: "1" | "cleared" | "format" | "err";
  if (String(formData.get("action") ?? "") === "clear") {
    try {
      await clearTextPin(user.id);
      outcome = "cleared";
    } catch (err) {
      console.warn("PIN texte non retiré (migration 0011 appliquée ?) :", err);
      outcome = "err";
    }
  } else {
    const pin = String(formData.get("text_pin") ?? "").trim();
    if (!isValidPinFormat(pin)) {
      outcome = "format";
    } else {
      try {
        await setTextPin(user.id, pin);
        outcome = "1";
      } catch (err) {
        console.warn("PIN texte non enregistré (migration 0011 appliquée ?) :", err);
        outcome = "err";
      }
    }
  }
  redirect(`/tableau-de-bord/agent?pin=${outcome}`);
}
