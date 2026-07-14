// Skill Météo — Open-Meteo (gratuit, sans clé API : parfait pour le budget mini).

import { CallSession, isEnglishLanguage, localizedText, SkillResult } from "./types";

const WMO_LABELS: Record<number, { fr: string; en: string }> = {
  0: { fr: "grand soleil", en: "clear sky" },
  1: { fr: "plutôt dégagé", en: "mostly clear" },
  2: { fr: "partiellement nuageux", en: "partly cloudy" },
  3: { fr: "couvert", en: "overcast" },
  45: { fr: "brouillard", en: "fog" },
  48: { fr: "brouillard givrant", en: "rime fog" },
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
  if (!city) {
    return localizedText(session.language, "Pour quelle ville ? (aucune ville de domicile n'est enregistrée)", "Which city? (no home city is saved)");
  }

  const geo = (await (
    await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&language=${localizedText(session.language, "fr", "en")}&count=1`,
    )
  ).json()) as { results?: { latitude: number; longitude: number; name: string }[] };
  const place = geo.results?.[0];
  if (!place) {
    return localizedText(session.language, `Je ne trouve pas la ville « ${city} ».`, `I could not find the city “${city}”.`);
  }

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
  if (!fc.daily) {
    return localizedText(session.language, "Le service météo ne répond pas, réessayez plus tard.", "The weather service is not responding, please try again later.");
  }

  const idx = args.day === "tomorrow" ? 1 : 0;
  const english = isEnglishLanguage(session.language);
  const label = idx === 1 ? localizedText(session.language, "Demain", "Tomorrow") : localizedText(session.language, "Aujourd'hui", "Today");
  const code = WMO_LABELS[fc.daily.weather_code[idx]]?.[english ? "en" : "fr"] ?? localizedText(session.language, "temps incertain", "uncertain weather");
  const tmax = Math.round(fc.daily.temperature_2m_max[idx]);
  const tmin = Math.round(fc.daily.temperature_2m_min[idx]);
  const rain = fc.daily.precipitation_probability_max[idx];
  const rainText = rain >= 30 ? localizedText(session.language, `, ${rain} % de risque de pluie — prévoir un parapluie`, `, ${rain}% chance of rain — bring an umbrella`) : "";
  return english
    ? `${label} in ${place.name}: ${code}, between ${tmin} and ${tmax} degrees${rainText}.`
    : `${label} à ${place.name} : ${code}, entre ${tmin} et ${tmax} degrés${rainText}.`;
}
