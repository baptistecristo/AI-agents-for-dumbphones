// Skill Météo — Open-Meteo (gratuit, sans clé API : parfait pour le budget mini).

import { CallSession, SkillResult } from "./types";

const WMO_FR: Record<number, string> = {
  0: "grand soleil",
  1: "plutôt dégagé",
  2: "partiellement nuageux",
  3: "couvert",
  45: "brouillard",
  48: "brouillard givrant",
  51: "bruine légère",
  53: "bruine",
  55: "bruine forte",
  61: "pluie légère",
  63: "pluie",
  65: "forte pluie",
  71: "neige légère",
  73: "neige",
  75: "forte neige",
  80: "averses légères",
  81: "averses",
  82: "fortes averses",
  95: "orages",
  96: "orages avec grêle",
  99: "gros orages avec grêle",
};

export async function getWeather(
  _session: CallSession,
  args: { city?: string; day?: string },
  homeCityFallback?: string | null,
): Promise<SkillResult> {
  const city = args.city || homeCityFallback;
  if (!city) return "Pour quelle ville ? (aucune ville de domicile n'est enregistrée)";

  const geo = (await (
    await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&language=fr&count=1`,
    )
  ).json()) as { results?: { latitude: number; longitude: number; name: string }[] };
  const place = geo.results?.[0];
  if (!place) return `Je ne trouve pas la ville « ${city} ».`;

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
  if (!fc.daily) return "Le service météo ne répond pas, réessayez plus tard.";

  const idx = args.day === "tomorrow" ? 1 : 0;
  const label = idx === 1 ? "Demain" : "Aujourd'hui";
  const code = WMO_FR[fc.daily.weather_code[idx]] ?? "temps incertain";
  const tmax = Math.round(fc.daily.temperature_2m_max[idx]);
  const tmin = Math.round(fc.daily.temperature_2m_min[idx]);
  const rain = fc.daily.precipitation_probability_max[idx];
  return `${label} à ${place.name} : ${code}, entre ${tmin} et ${tmax} degrés${rain >= 30 ? `, ${rain} % de risque de pluie — prévoir un parapluie` : ""}.`;
}
