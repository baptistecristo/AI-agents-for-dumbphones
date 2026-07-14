// Skill Navigation-par-SMS (§8 du doc d'archi) : itinéraire compressé en
// étapes lisibles, envoyé par SMS, avec résumé vocal.
// Fournisseur : OpenRouteService (gratuit jusqu'à 2000 req/j, EU-friendly).

import { envOr } from "../env";
import { sendSms } from "../twilio";
import { CallSession, SkillResult, t } from "./types";

type OrsFeature = {
  properties: {
    segments: { duration: number; distance: number; steps: { instruction: string; distance: number }[] }[];
  };
};

async function geocode(q: string, lang: string): Promise<[number, number] | null> {
  const key = envOr("ORS_API_KEY", "");
  const res = await fetch(
    `https://api.openrouteservice.org/geocode/search?api_key=${key}&text=${encodeURIComponent(q)}&boundary.country=FR&size=1&lang=${lang}`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { features?: { geometry: { coordinates: [number, number] } }[] };
  return data.features?.[0]?.geometry.coordinates ?? null;
}

export async function getDirections(
  session: CallSession,
  args: { destination: string; origin?: string; mode?: string },
  homeAddress?: string | null,
): Promise<SkillResult> {
  if (!envOr("ORS_API_KEY", "")) {
    return t(session, {
      fr: "Le service d'itinéraires n'est pas encore configuré (clé OpenRouteService manquante).",
      en: "The directions service isn't configured yet (missing OpenRouteService key).",
    });
  }
  const origin = args.origin || homeAddress;
  if (!origin)
    return t(session, {
      fr: "D'où partez-vous ? (demander le point de départ)",
      en: "Where are you starting from? (ask for the starting point)",
    });

  const [from, to] = await Promise.all([geocode(origin, session.language), geocode(args.destination, session.language)]);
  if (!from)
    return t(session, {
      fr: `Je ne trouve pas le point de départ « ${origin} ».`,
      en: `I can't find the starting point "${origin}".`,
    });
  if (!to)
    return t(session, {
      fr: `Je ne trouve pas la destination « ${args.destination} ».`,
      en: `I can't find the destination "${args.destination}".`,
    });

  const profile =
    args.mode === "driving" ? "driving-car" : args.mode === "transit" ? "foot-walking" : "foot-walking";
  const res = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, {
    method: "POST",
    headers: {
      Authorization: envOr("ORS_API_KEY", ""),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ coordinates: [from, to], language: session.language }),
  });
  if (!res.ok)
    return t(session, {
      fr: "Le calcul d'itinéraire a échoué, réessayez dans un instant.",
      en: "The route calculation failed, try again in a moment.",
    });
  const data = (await res.json()) as { features: OrsFeature[] };
  const seg = data.features?.[0]?.properties.segments?.[0];
  if (!seg) return t(session, { fr: "Aucun itinéraire trouvé.", en: "No route found." });

  const minutes = Math.round(seg.duration / 60);
  const km = (seg.distance / 1000).toFixed(1);
  const steps = seg.steps
    .filter((s) => s.distance > 15)
    .map((s, i) => `${i + 1}. ${s.instruction} (${s.distance > 950 ? `${(s.distance / 1000).toFixed(1)} km` : `${Math.round(s.distance)} m`})`);

  // SMS en morceaux lisibles (max ~450 caractères par SMS, max 3 SMS)
  if (session.callerNumber) {
    const header = t(session, {
      fr: `Itinéraire vers ${args.destination} (${km} km, ~${minutes} min) :\n`,
      en: `Route to ${args.destination} (${km} km, ~${minutes} min):\n`,
    });
    const chunks: string[] = [];
    let current = header;
    for (const step of steps) {
      if ((current + step).length > 450 && chunks.length < 2) {
        chunks.push(current.trimEnd());
        current = "";
      }
      current += step + "\n";
    }
    chunks.push(current.trimEnd());
    for (const [i, chunk] of chunks.entries()) {
      await sendSms({
        to: session.callerNumber,
        body: chunks.length > 1 ? `(${i + 1}/${chunks.length}) ${chunk}` : chunk,
        userId: session.userId ?? undefined,
        kind: "route_steps",
      });
    }
  }

  const firstSteps = steps.slice(0, 2).join(t(session, { fr: " Puis : ", en: " Then: " }));
  return t(session, {
    fr: `Trajet de ${km} kilomètres, environ ${minutes} minutes ${args.mode === "driving" ? "en voiture" : "à pied"}. Pour commencer : ${firstSteps}. Les étapes complètes viennent d'être envoyées par SMS.`,
    en: `A ${km}-kilometre trip, about ${minutes} minutes ${args.mode === "driving" ? "by car" : "on foot"}. To start: ${firstSteps}. The full steps were just sent to you by SMS.`,
  });
}
