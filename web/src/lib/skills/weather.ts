// Skill Météo — Open-Meteo (gratuit, sans clé API : parfait pour le budget mini).

import { CallSession, SkillResult, t } from "./types";

const WMO: Record<number, { fr: string; en: string }> = {
  0: { fr: "grand soleil", en: "clear skies" },
  1: { fr: "plutôt dégagé", en: "mostly clear" },
  2: { fr: "partiellement nuageux", en: "partly cloudy" },
  3: { fr: "couvert", en: "overcast" },
  45: { fr: "brouillard", en: "fog" },
  48: { fr: "brouillard givrant", en: "freezing fog" },
  51: { fr: "bruine légère", en: "light drizzle" },
  53: { fr: "bruine", en: "drizzle" },
  55: { fr: "bruine forte", en: "heavy drizzle" },
  61: { fr: "pluie légère", en: "light rain" },
  63: { fr: "pluie", en: "rain" },
  65: { fr: "forte pluie", en: "heavy rain" },
  71: { fr: "neige légère", en: "light snow" },
  73: { fr: "neige", en: "snow" },
  75: { fr: "forte neige", en: "heavy snow" },
  80: { fr: "averses légères", en: "light showers" },
  81: { fr: "averses", en: "showers" },
  82: { fr: "fortes averses", en: "heavy showers" },
  95: { fr: "orages", en: "thunderstorms" },
  96: { fr: "orages avec grêle", en: "thunderstorms with hail" },
  99: { fr: "gros orages avec grêle", en: "severe thunderstorms with hail" },
};

export async function getWeather(
  session: CallSession,
  args: { city?: string; day?: string },
  homeCityFallback?: string | null,
): Promise<SkillResult> {
  const city = args.city || homeCityFallback;
  if (!city)
    return t(session, {
      fr: "Pour quelle ville ? (aucune ville de domicile n'est enregistrée)",
      en: "For which city? (no home city is set)",
    });

  const geo = (await (
    await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&language=${session.language}&count=1`,
    )
  ).json()) as { results?: { latitude: number; longitude: number; name: string }[] };
  const place = geo.results?.[0];
  if (!place)
    return t(session, {
      fr: `Je ne trouve pas la ville « ${city} ».`,
      en: `I can't find the city "${city}".`,
    });

  const fc = (await (
    await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&timezone=Europe%2FParis&forecast_days=2`,
    )
  ).json()) as {
    daily?: {
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: number[];
    };
  };
  if (!fc.daily)
    return t(session, {
      fr: "Le service météo ne répond pas, réessayez plus tard.",
      en: "The weather service isn't responding, try again later.",
    });

  const idx = args.day === "tomorrow" ? 1 : 0;
  const label = t(session, idx === 1 ? { fr: "Demain", en: "Tomorrow" } : { fr: "Aujourd'hui", en: "Today" });
  const code = WMO[fc.daily.weather_code[idx]]
    ? t(session, WMO[fc.daily.weather_code[idx]])
    : t(session, { fr: "temps incertain", en: "uncertain weather" });
  const tmax = Math.round(fc.daily.temperature_2m_max[idx]);
  const tmin = Math.round(fc.daily.temperature_2m_min[idx]);
  const rain = fc.daily.precipitation_probability_max[idx];
  return t(session, {
    fr: `${label} à ${place.name} : ${code}, entre ${tmin} et ${tmax} degrés${rain >= 30 ? `, ${rain} % de risque de pluie — prévoir un parapluie` : ""}.`,
    en: `${label} in ${place.name}: ${code}, between ${tmin} and ${tmax} degrees${rain >= 30 ? `, ${rain}% chance of rain — bring an umbrella` : ""}.`,
  });
}
