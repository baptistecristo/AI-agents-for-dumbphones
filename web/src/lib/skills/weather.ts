// Skill Météo — Open-Meteo (gratuit, sans clé API : parfait pour le budget mini).

import { CallSession, SkillResult, t } from "./types";

const WMO: Record<number, { fr: string; en: string; es: string }> = {
  0: { fr: "grand soleil", en: "clear skies", es: "cielo despejado" },
  1: { fr: "plutôt dégagé", en: "mostly clear", es: "bastante despejado" },
  2: { fr: "partiellement nuageux", en: "partly cloudy", es: "parcialmente nublado" },
  3: { fr: "couvert", en: "overcast", es: "cubierto" },
  45: { fr: "brouillard", en: "fog", es: "niebla" },
  48: { fr: "brouillard givrant", en: "freezing fog", es: "niebla helada" },
  51: { fr: "bruine légère", en: "light drizzle", es: "llovizna ligera" },
  53: { fr: "bruine", en: "drizzle", es: "llovizna" },
  55: { fr: "bruine forte", en: "heavy drizzle", es: "llovizna fuerte" },
  61: { fr: "pluie légère", en: "light rain", es: "lluvia ligera" },
  63: { fr: "pluie", en: "rain", es: "lluvia" },
  65: { fr: "forte pluie", en: "heavy rain", es: "lluvia fuerte" },
  71: { fr: "neige légère", en: "light snow", es: "nieve ligera" },
  73: { fr: "neige", en: "snow", es: "nieve" },
  75: { fr: "forte neige", en: "heavy snow", es: "nieve fuerte" },
  80: { fr: "averses légères", en: "light showers", es: "chubascos ligeros" },
  81: { fr: "averses", en: "showers", es: "chubascos" },
  82: { fr: "fortes averses", en: "heavy showers", es: "chubascos fuertes" },
  95: { fr: "orages", en: "thunderstorms", es: "tormentas" },
  96: { fr: "orages avec grêle", en: "thunderstorms with hail", es: "tormentas con granizo" },
  99: { fr: "gros orages avec grêle", en: "severe thunderstorms with hail", es: "tormentas fuertes con granizo" },
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
      es: "¿Para qué ciudad? (no hay ciudad de domicilio registrada)",
    });

  const geo = (await (
    await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&language=${session.language}&count=1`,
    )
  ).json()) as { results?: { latitude: number; longitude: number; name: string }[] };
  const place = geo.results?.[0];
  // On ne répète que ce que la personne a dit elle-même. Le repli vient du
  // profil : si l'extraction de la ville a mal découpé l'adresse, le renvoyer
  // ici prononcerait la rue à voix haute — sans code, à qui que ce soit qui
  // appelle depuis un numéro usurpé.
  if (!place)
    return t(session, {
      fr: args.city
        ? `Je ne trouve pas la ville « ${args.city} ».`
        : "Je ne reconnais pas la ville enregistrée dans le profil. Demande pour quelle ville, sans deviner.",
      en: args.city
        ? `I can't find the city "${args.city}".`
        : "I don't recognise the city saved in the profile. Ask which city, without guessing.",
      es: args.city
        ? `No encuentro la ciudad «${args.city}».`
        : "No reconozco la ciudad guardada en el perfil. Pregunta para qué ciudad, sin adivinar.",
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
      es: "El servicio del tiempo no responde, inténtalo más tarde.",
    });

  const idx = args.day === "tomorrow" ? 1 : 0;
  const label = t(
    session,
    idx === 1
      ? { fr: "Demain", en: "Tomorrow", es: "Mañana" }
      : { fr: "Aujourd'hui", en: "Today", es: "Hoy" },
  );
  const code = WMO[fc.daily.weather_code[idx]]
    ? t(session, WMO[fc.daily.weather_code[idx]])
    : t(session, { fr: "temps incertain", en: "uncertain weather", es: "tiempo incierto" });
  const tmax = Math.round(fc.daily.temperature_2m_max[idx]);
  const tmin = Math.round(fc.daily.temperature_2m_min[idx]);
  const rain = fc.daily.precipitation_probability_max[idx];
  return t(session, {
    fr: `${label} à ${place.name} : ${code}, entre ${tmin} et ${tmax} degrés${rain >= 30 ? `, ${rain} % de risque de pluie — prévoir un parapluie` : ""}.`,
    en: `${label} in ${place.name}: ${code}, between ${tmin} and ${tmax} degrees${rain >= 30 ? `, ${rain}% chance of rain — bring an umbrella` : ""}.`,
    es: `${label} en ${place.name}: ${code}, entre ${tmin} y ${tmax} grados${rain >= 30 ? `, ${rain} % de probabilidad de lluvia — lleva paraguas` : ""}.`,
  });
}
