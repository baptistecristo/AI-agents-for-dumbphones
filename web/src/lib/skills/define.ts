// Skill Définition — dictionaryapi.dev (gratuit, sans clé API). Anglais uniquement.

import { CallSession, SkillResult, t } from "./types";

export async function define(session: CallSession, args: { word?: string }): Promise<SkillResult> {
  // dictionaryapi.dev est anglais uniquement. Sur un appel FR, on le dit plutôt
  // que de lire une définition anglaise à quelqu'un qui a appelé en français.
  if (session.language !== "en")
    return t(session, {
      fr: "Je ne sais définir que des mots anglais.",
      en: "I can only define English words.",
    });

  const word = args.word?.trim();
  if (!word) return t(session, { fr: "Quel mot dois-je définir ?", en: "Which word should I define?" });

  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (!res.ok)
    return t(session, {
      fr: `Je ne trouve pas de définition pour « ${word} ».`,
      en: `I couldn't find a definition for "${word}".`,
    });

  const data = (await res.json()) as { meanings?: { definitions?: { definition?: string }[] }[] }[];
  const first = data[0]?.meanings?.[0]?.definitions?.[0]?.definition;
  if (!first)
    return t(session, {
      fr: `Aucune définition pour « ${word} ».`,
      en: `No definition found for "${word}".`,
    });

  return t(session, { fr: `${word} : ${first}`, en: `${word}: ${first}` });
}
