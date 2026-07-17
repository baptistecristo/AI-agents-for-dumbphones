// Skill Mémoire — remember / recall (profil durable par utilisateur, §4).

import { supabaseAdmin } from "../supabase/admin";
import { CallSession, SkillResult, t } from "./types";

export async function remember(session: CallSession, args: { key: string; value: string }): Promise<SkillResult> {
  if (!session.userId)
    return t(session, {
      fr: "Appelant non identifié : je ne peux rien retenir.",
      en: "Unidentified caller: I can't remember anything.",
      es: "Persona no identificada: no puedo memorizar nada.",
    });
  const key = args.key.toLowerCase().trim();
  // Prendre une note est libre (sans code), mais un appel non vérifié ne doit
  // jamais écraser une note existante : sinon un caller-ID spoofé pourrait
  // corrompre les données. Remplacer une note existante exige le code.
  if (!session.verified) {
    const { data: existing } = await supabaseAdmin()
      .from("memories")
      .select("key")
      .eq("user_id", session.userId)
      .eq("key", key)
      .maybeSingle();
    if (existing)
      return t(session, {
        fr: `J'ai déjà une note « ${key} ». Pour la remplacer, il me faudra ton code.`,
        en: `I already have a "${key}" note. To replace it, I'll need your code.`,
        es: `Ya tengo una nota «${key}». Para reemplazarla, necesitaré tu código.`,
      });
  }
  const { error } = await supabaseAdmin().from("memories").upsert(
    {
      user_id: session.userId,
      key,
      value: args.value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,key" },
  );
  if (error)
    return t(session, {
      fr: "Je n'ai pas réussi à l'enregistrer, désolé.",
      en: "I couldn't save it, sorry.",
      es: "No he podido guardarlo, lo siento.",
    });
  return t(session, {
    fr: `C'est retenu : ${args.key} → ${args.value}.`,
    en: `Got it: ${args.key} → ${args.value}.`,
    es: `Memorizado: ${args.key} → ${args.value}.`,
  });
}

export async function recall(session: CallSession, args: { query: string }): Promise<SkillResult> {
  if (!session.userId) return t(session, { fr: "Appelant non identifié.", en: "Unidentified caller.", es: "Persona no identificada." });
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
      es: `Nada en la memoria sobre «${args.query}».`,
    });
  return data.map((m) => `- ${m.key} : ${m.value}`).join("\n");
}
