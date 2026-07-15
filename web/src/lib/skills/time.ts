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

  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&language=${session.language}&count=1`,
  );

  if (!geoRes.ok)
    return t(session, {
      fr: "Le service de recherche de ville ne répond pas, réessayez plus tard.",
      en: "The city lookup service isn't responding, try again later.",
    });

  const geo = (await geoRes.json()) as {
    results?: { name: string; timezone: string }[];
  };

  const place = geo.results?.[0];

  if (!place)
    return t(session, {
      fr: `Je ne trouve pas la ville « ${city} ».`,
      en: `I can't find the city "${city}".`,
    });

  const timeRes = await fetch(
    `https://worldtimeapi.org/api/timezone/${place.timezone}`,
  );

  if (!timeRes.ok)
    return t(session, {
      fr: "Le service d'heure locale ne répond pas, réessayez plus tard.",
      en: "The local time service isn't responding, try again later.",
    });

  const data = (await timeRes.json()) as {
    datetime?: string;
  };

  if (!data.datetime)
    return t(session, {
      fr: "Le service d'heure locale ne répond pas, réessayez plus tard.",
      en: "The local time service isn't responding, try again later.",
    });

  const localTime = new Intl.DateTimeFormat(
    session.language === "fr" ? "fr-FR" : "en-US",
    {
      timeZone: place.timezone,
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(new Date(data.datetime));

  return t(session, {
    fr: `À ${place.name}, il est ${localTime}.`,
    en: `In ${place.name}, it's ${localTime}.`,
  });
}