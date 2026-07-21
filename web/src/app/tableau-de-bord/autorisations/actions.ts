"use server";

// Registre de consentement : chaque changement est une NOUVELLE ligne. La table
// consents est append-only (RLS = insert + select, jamais update ni delete),
// donc on n'écrase jamais un choix — on empile l'état voulu, horodaté.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordCallerTrust } from "@/lib/consent";
import { siteLanguage } from "@/lib/site-i18n";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { CONSENT_SOURCES, DASHBOARD } from "../copy";

// La liste vient de copy.ts, elle n'est pas recopiée ici : cette page en tenait
// une deuxième à la main, et une source ajoutée d'un seul côté s'affichait sans
// jamais pouvoir être basculée. Une valeur hors liste (input hidden trafiqué)
// reste simplement ignorée : on n'insère rien d'inconnu.
const KNOWN_SOURCES: readonly string[] = CONSENT_SOURCES;

export async function toggleConsent(formData: FormData): Promise<void> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const source = String(formData.get("source") ?? "");
  if (!KNOWN_SOURCES.includes(source)) return;

  // La valeur reçue est DÉJÀ l'état voulu (l'opposé de l'état affiché). On
  // l'ajoute au registre ; on ne modifie ni ne supprime aucune ligne existante.
  // scope_note : la note dans la langue du site au moment du choix (même
  // précédent que l'onboarding — le registre garde ce que la personne a vu).
  await supabaseAdmin().from("consents").insert({
    user_id: user.id,
    source,
    granted: formData.get("granted") === "true",
    scope_note: DASHBOARD[await siteLanguage()].autorisations.scopeNote,
  });

  revalidatePath("/tableau-de-bord/autorisations");
}

// Grant « appelant de confiance » : même registre, même append-only, mais porté
// par un numéro (consents.subject) et non par le compte entier.
//
// Deux vérifications, pas une : le compte (une Server Action se poste
// directement, l'authentification ne se déduit pas de la page qui l'a affichée),
// puis le numéro lui-même, qui doit appartenir à ce compte et être vérifié.
// recordCallerTrust s'en charge en base et n'écrit rien sinon.
export async function toggleCallerTrust(formData: FormData): Promise<void> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const subject = String(formData.get("subject") ?? "");
  if (!subject) return;

  await recordCallerTrust(
    user.id,
    subject,
    formData.get("granted") === "true",
    DASHBOARD[await siteLanguage()].autorisations.trusted.scopeNote,
  );

  revalidatePath("/tableau-de-bord/autorisations");
}
