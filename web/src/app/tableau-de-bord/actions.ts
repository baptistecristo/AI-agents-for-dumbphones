"use server";

// Actions du tableau de bord : consentements révocables + déconnexion.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
  await supabaseAdmin()
    .from("profiles")
    .update({
      preferred_name: preferredName || null,
      home_address: homeAddress || null,
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
