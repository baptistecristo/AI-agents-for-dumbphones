// Skill Mémoire — remember / recall (profil durable par utilisateur, §4).

import { supabaseAdmin } from "../supabase/admin";
import { CallSession, localizedText, SkillResult } from "./types";

export async function remember(session: CallSession, args: { key: string; value: string }): Promise<SkillResult> {
  if (!session.userId) return localizedText(session.language, "Appelant non identifié : je ne peux rien retenir.", "Caller not identified: I cannot remember anything.");
  const { error } = await supabaseAdmin().from("memories").upsert(
    {
      user_id: session.userId,
      key: args.key.toLowerCase().trim(),
      value: args.value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,key" },
  );
  if (error) return localizedText(session.language, "Je n'ai pas réussi à l'enregistrer, désolé.", "I could not save it, sorry.");
  return localizedText(session.language, `C'est retenu : ${args.key} → ${args.value}.`, `Stored: ${args.key} → ${args.value}.`);
}

export async function recall(session: CallSession, args: { query: string }): Promise<SkillResult> {
  if (!session.userId) return localizedText(session.language, "Appelant non identifié.", "Caller not identified.");
  const q = args.query.toLowerCase().trim();
  const { data } = await supabaseAdmin()
    .from("memories")
    .select("key, value")
    .eq("user_id", session.userId)
    .or(`key.ilike.%${q}%,value.ilike.%${q}%`)
    .limit(5);
  if (!data || data.length === 0) return localizedText(session.language, `Rien en mémoire à propos de « ${args.query} ».`, `Nothing in memory about “${args.query}”.`);
  return data.map((m) => `- ${m.key} : ${m.value}`).join("\n");
}
