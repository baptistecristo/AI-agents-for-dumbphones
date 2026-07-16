"use server";

// Compte : les deux gestes qui touchent au compte lui-même. Une server action
// est une URL publique — jamais une source de confiance — donc chacune refait
// la garde d'accès, et la suppression exige une phrase tapée à l'identique avant
// de faire quoi que ce soit d'irréversible.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

// Détache Google côté application : on retire la connexion locale (et donc le
// jeton chiffré qui vit dans la même ligne). On ne révoque rien chez Google —
// l'utilisateur reste maître de ça depuis son compte Google.
export async function disconnectGoogle(): Promise<void> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  await supabaseAdmin().from("google_connections").delete().eq("user_id", user.id);
  revalidatePath("/tableau-de-bord/compte");
}

// Droit à l'effacement (RGPD). Garde-fou : la personne doit avoir tapé la phrase
// exacte. Sinon on ne supprime rien et on renvoie vers la page avec l'erreur.
export async function deleteAccount(formData: FormData): Promise<void> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const confirm = String(formData.get("confirm") ?? "");
  if (confirm !== "SUPPRIMER MON COMPTE") {
    redirect("/tableau-de-bord/compte?erreur=confirmation");
  }

  // deleteUser retire l'utilisateur d'auth et, par ON DELETE CASCADE, toutes ses
  // lignes dans les tables publiques (profil, numéros, rappels, mémoire, journaux).
  await supabaseAdmin().auth.admin.deleteUser(user.id);
  await supabase.auth.signOut();
  redirect("/");
}
