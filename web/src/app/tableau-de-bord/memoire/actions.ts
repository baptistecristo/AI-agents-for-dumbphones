"use server";

// Ma mémoire : les notes durables (table `memories`) et l'annulation d'un rappel
// en attente (table `reminders`). Ces server actions sont des URL publiques —
// jamais une source de confiance — donc chacune refait la garde d'accès et scope
// TOUTE requête sur user.id (supabaseAdmin contourne la RLS).
//
// Point clé : la clé d'une note est normalisée EXACTEMENT comme le fait l'agent
// au téléphone (skills/memory.ts) — `key.toLowerCase().trim()` puis upsert avec
// onConflict "user_id,key". Le web et la voix partagent ainsi un seul magasin,
// sans jamais créer de doublon ni de clé en majuscules.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

const PATH = "/tableau-de-bord/memoire";

// Garde d'accès partagée par toutes les actions. Non exportée : dans un fichier
// "use server", seuls les exports doivent être des fonctions serveur async.
async function requireUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  return user;
}

// Même normalisation que l'agent : c'est ce qui garantit un magasin unique.
function normalizeKey(raw: unknown): string {
  return String(raw ?? "").toLowerCase().trim();
}

// Ajouter une note (formulaire). Clé + valeur requises côté client ; un POST
// bricolé sans l'un des deux ne réécrit rien.
export async function addMemory(formData: FormData): Promise<void> {
  const user = await requireUser();
  const key = normalizeKey(formData.get("key"));
  const value = String(formData.get("value") ?? "").trim();
  if (!key || !value) return;

  await supabaseAdmin()
    .from("memories")
    .upsert(
      { user_id: user.id, key, value, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" },
    );
  revalidatePath(PATH);
}

// Modifier la valeur d'une note (la clé reste son identité). On renormalise la
// clé reçue pour retomber sur la même ligne que l'agent — sinon un upsert
// créerait un doublon.
export async function updateMemory(key: string, value: string): Promise<void> {
  const user = await requireUser();
  const normKey = normalizeKey(key);
  const val = String(value ?? "").trim();
  if (!normKey || !val) return;

  await supabaseAdmin()
    .from("memories")
    .upsert(
      { user_id: user.id, key: normKey, value: val, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" },
    );
  revalidatePath(PATH);
}

// Supprimer une note : scopé par user_id ET key.
export async function deleteMemory(key: string): Promise<void> {
  const user = await requireUser();
  const normKey = normalizeKey(key);
  if (!normKey) return;

  await supabaseAdmin().from("memories").delete().eq("user_id", user.id).eq("key", normKey);
  revalidatePath(PATH);
}

// Annuler un rappel en attente : scopé par id ET user_id, pour ne jamais
// toucher la ligne d'un autre.
export async function cancelReminder(id: string): Promise<void> {
  const user = await requireUser();
  const reminderId = String(id ?? "").trim();
  if (!reminderId) return;

  await supabaseAdmin()
    .from("reminders")
    .update({ status: "cancelled" })
    .eq("id", reminderId)
    .eq("user_id", user.id);
  revalidatePath(PATH);
}
