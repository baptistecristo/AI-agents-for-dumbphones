// Skill Heure locale — Open-Meteo geocoding + WorldTimeAPI (gratuits, sans clé API).

import { CallSession, SkillResult, t } from "./types";

export async function getCurrentTime(
  session: CallSession,
  args: { city?: string },
): Promise<SkillResult> {
    const city = args.city?.trim();

  if (!city)
    return t(session, {
      fr: "Pour quelle ville ?",
      en: "For which city?",
    });
}