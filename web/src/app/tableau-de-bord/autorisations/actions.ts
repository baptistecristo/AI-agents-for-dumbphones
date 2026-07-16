"use server";

// Registre de consentement : chaque changement est une NOUVELLE ligne. La table
// consents est append-only (RLS = insert + select, jamais update ni delete),
// donc on n'écrase jamais un choix — on empile l'état voulu, horodaté.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

// Les six sources du registre. Une valeur hors liste (input hidden trafiqué)
// est simplement ignorée : on n'insère rien d'inconnu.
const CONSENT_SOURCES = ["calendar", "contacts", "sms", "outbound_calls", "memory", "recording"];

export async function toggleConsent(formData: FormData): Promise<void> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const source = String(formData.get("source") ?? "");
  if (!CONSENT_SOURCES.includes(source)) return;

  // La valeur reçue est DÉJÀ l'état voulu (l'opposé de l'état affiché). On
  // l'ajoute au registre ; on ne modifie ni ne supprime aucune ligne existante.
  await supabaseAdmin().from("consents").insert({
    user_id: user.id,
    source,
    granted: formData.get("granted") === "true",
    scope_note: "Modifié depuis l'espace personnel",
  });

  revalidatePath("/tableau-de-bord/autorisations");
}
