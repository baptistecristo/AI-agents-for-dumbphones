"use server";

// Actions partagées de l'espace personnel. Les actions propres à une section
// (personnalisation, mémoire, autorisations, compte) sont co-localisées dans le
// dossier de leur page ; ici, seul ce qui vaut pour toute la coque.

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export async function signOut(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/");
}
