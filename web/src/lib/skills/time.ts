// Skill Heure locale : géocodage Open-Meteo (gratuit, sans clé API), puis
// conversion locale.
//
// Il y avait ici un second appel réseau, à worldtimeapi.org, pour demander
// l'heure qu'il est. Il ne servait à rien : Intl.DateTimeFormat convertit
// n'importe quel instant vers le fuseau qu'on lui donne, et le fuseau, le
// géocodage vient de le rendre. L'instant à convertir, c'est maintenant, et le
// serveur le sait. Ce deuxième appel n'apportait donc que sa latence et ses
// pannes : worldtimeapi.org refusait la connexion TLS le 30/07/2026 et le skill
// tombait avec lui, alors que tout ce qu'il fallait était déjà là.

import { safeFetch } from "../net";
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
      es: "¿Para qué ciudad?",
    });

  const geoRes = await safeFetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&language=${session.language}&count=1`,
  );

  if (!geoRes.ok)
    return t(session, {
      fr: "Le service de recherche de ville ne répond pas, réessayez plus tard.",
      en: "The city lookup service isn't responding, try again later.",
      es: "El servicio de búsqueda de ciudades no responde, inténtalo más tarde.",
    });

  const geo = (await geoRes.json()) as {
    results?: { name: string; timezone: string }[];
  };

  const place = geo.results?.[0];

  if (!place)
    return t(session, {
      fr: `Je ne trouve pas la ville « ${city} ».`,
      en: `I can't find the city "${city}".`,
      es: `No encuentro la ciudad «${city}».`,
    });

  // Un fuseau inconnu d'Intl ferait lever un RangeError, qui remonterait à
  // l'appelant en « ce service ne répond pas ». Open-Meteo rend des noms IANA,
  // mais c'est une donnée tierce : on la traite comme telle.
  let localTime: string;
  try {
    localTime = new Intl.DateTimeFormat(
      session.language === "fr" ? "fr-FR" : session.language === "es" ? "es-ES" : "en-US",
      {
        timeZone: place.timezone,
        hour: "numeric",
        minute: "2-digit",
      },
    ).format(new Date());
  } catch {
    return t(session, {
      fr: `Je ne connais pas le fuseau horaire de « ${city} ».`,
      en: `I don't know the time zone for "${city}".`,
      es: `No conozco la zona horaria de «${city}».`,
    });
  }

  return t(session, {
    fr: `À ${place.name}, il est ${localTime}.`,
    en: `In ${place.name}, it's ${localTime}.`,
    es: `En ${place.name} son las ${localTime}.`,
  });
}