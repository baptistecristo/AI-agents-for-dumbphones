// Skill Mémoire — remember / recall (profil durable par utilisateur, §4).

import { supabaseAdmin } from "../supabase/admin";
import { CallSession, SkillResult, t } from "./types";

export async function remember(session: CallSession, args: { key: string; value: string }): Promise<SkillResult> {
  if (!session.userId)
    return t(session, {
      fr: "Appelant non identifié : je ne peux rien retenir.",
      en: "Unidentified caller: I can't remember anything.",
    });
  const { error } = await supabaseAdmin().from("memories").upsert(
    {
      user_id: session.userId,
      key: args.key.toLowerCase().trim(),
      value: args.value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,key" },
  );
  if (error)
    return t(session, {
      fr: "Je n'ai pas réussi à l'enregistrer, désolé.",
      en: "I couldn't save it, sorry.",
    });
  return t(session, {
    fr: `C'est retenu : ${args.key} → ${args.value}.`,
    en: `Got it: ${args.key} → ${args.value}.`,
  });
}

export async function recall(session: CallSession, args: { query: string }): Promise<SkillResult> {
  if (!session.userId) return t(session, { fr: "Appelant non identifié.", en: "Unidentified caller." });
  const q = args.query.toLowerCase().trim();
  const { data } = await supabaseAdmin()
    .from("memories")
    .select("key, value")
    .eq("user_id", session.userId)
    .or(`key.ilike.%${q}%,value.ilike.%${q}%`)
    .limit(5);
  if (!data || data.length === 0)
    return t(session, {
      fr: `Rien en mémoire à propos de « ${args.query} ».`,
      en: `Nothing in memory about "${args.query}".`,
    });
  return data.map((m) => `- ${m.key} : ${m.value}`).join("\n");
}
