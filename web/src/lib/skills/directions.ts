// Skill Navigation-par-SMS (§8 du doc d'archi) : itinéraire compressé en
// étapes lisibles, envoyé par SMS, avec résumé vocal.
// Fournisseur : OpenRouteService (gratuit jusqu'à 2000 req/j, EU-friendly).

import { envOr } from "../env";
import { sendSms, smsProviderConfigured, warnSmsProviderMissing } from "../twilio";
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
      es: "El servicio de rutas aún no está configurado (falta la clave de OpenRouteService).",
    });
  }
  const origin = args.origin || homeAddress;
  if (!origin)
    return t(session, {
      fr: "D'où partez-vous ? (demander le point de départ)",
      en: "Where are you starting from? (ask for the starting point)",
      es: "¿Desde dónde sales? (preguntar el punto de partida)",
    });

  const [from, to] = await Promise.all([geocode(origin, session.language), geocode(args.destination, session.language)]);
  if (!from)
    return t(session, {
      fr: `Je ne trouve pas le point de départ « ${origin} ».`,
      en: `I can't find the starting point "${origin}".`,
      es: `No encuentro el punto de partida «${origin}».`,
    });
  if (!to)
    return t(session, {
      fr: `Je ne trouve pas la destination « ${args.destination} ».`,
      en: `I can't find the destination "${args.destination}".`,
      es: `No encuentro el destino «${args.destination}».`,
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
      es: "El cálculo de la ruta ha fallado, inténtalo en un momento.",
    });
  const data = (await res.json()) as { features: OrsFeature[] };
  const seg = data.features?.[0]?.properties.segments?.[0];
  if (!seg) return t(session, { fr: "Aucun itinéraire trouvé.", en: "No route found.", es: "Ninguna ruta encontrada." });

  const minutes = Math.round(seg.duration / 60);
  const km = (seg.distance / 1000).toFixed(1);
  const steps = seg.steps
    .filter((s) => s.distance > 15)
    .map((s, i) => `${i + 1}. ${s.instruction} (${s.distance > 950 ? `${(s.distance / 1000).toFixed(1)} km` : `${Math.round(s.distance)} m`})`);

  // SMS en morceaux lisibles (max ~450 caractères par SMS, max 3 SMS)
  const providerReady = smsProviderConfigured("send");
  let smsSent = false;
  let smsPartial = false;
  if (session.callerNumber && !providerReady) {
    warnSmsProviderMissing(`étapes d'itinéraire pendant l'appel ${session.callId}`);
  } else if (session.callerNumber && steps.length > 0) {
    const header = t(session, {
      fr: `Itinéraire vers ${args.destination} (${km} km, ~${minutes} min) :\n`,
      en: `Route to ${args.destination} (${km} km, ~${minutes} min):\n`,
      es: `Ruta hacia ${args.destination} (${km} km, ~${minutes} min):\n`,
    });
    // Le plafond porte sur l'ENVOI, pas sur le découpage. Le borner dans la
    // condition de coupe laissait le dernier morceau tout absorber : sur un
    // trajet en voiture de 60 étapes, le 3e « SMS » faisait plusieurs milliers
    // de caractères, facturés en autant de segments concaténés.
    const chunks: string[] = [];
    let current = header;
    for (const step of steps) {
      if ((current + step).length > 450) {
        chunks.push(current.trimEnd());
        current = "";
      }
      current += step + "\n";
    }
    chunks.push(current.trimEnd());
    // Au-delà de 3 SMS, on coupe — et on ne prétend pas avoir tout envoyé.
    const sent = chunks.slice(0, 3);
    for (const [i, chunk] of sent.entries()) {
      await sendSms({
        to: session.callerNumber,
        body: sent.length > 1 ? `(${i + 1}/${sent.length}) ${chunk}` : chunk,
        userId: session.userId ?? undefined,
        kind: "route_steps",
      });
    }
    smsSent = sent.length === chunks.length;
    smsPartial = !smsSent;
  }

  // La phrase de fin dit ce qui s'est réellement passé : promettre un SMS qui
  // n'est jamais parti laisse la personne guetter son téléphone pour rien.
  // L'ordre des cas suit celui des causes, du plus précis au plus général.
  const tail = smsSent
    ? {
        fr: "Les étapes complètes viennent d'être envoyées par SMS.",
        en: "The full steps were just sent to you by SMS.",
        es: "Los pasos completos acaban de enviarse por SMS.",
      }
    : smsPartial
      ? {
          fr: "Le trajet est trop long pour tenir en SMS : seul le début vient de partir. Propose de lire la suite à voix haute.",
          en: "The route is too long to text in full: only the start was just sent. Offer to read the rest out loud.",
          es: "La ruta es demasiado larga para caber en SMS: solo se ha enviado el principio. Propón leer el resto en voz alta.",
        }
      : steps.length === 0
        ? {
            fr: "Le trajet est trop court pour avoir des étapes détaillées : il n'y a rien à envoyer par SMS.",
            en: "The route is too short to have detailed steps: there is nothing to text.",
            es: "La ruta es demasiado corta para tener pasos detallados: no hay nada que enviar por SMS.",
          }
        : !providerReady
          ? {
              fr: "Je ne peux pas envoyer les étapes par SMS : aucun fournisseur SMS n'est branché ici. Propose de lire la suite à voix haute.",
              en: "I can't text the steps: no SMS provider is connected here. Offer to read the rest out loud.",
              es: "No puedo enviar los pasos por SMS: aquí no hay proveedor de SMS conectado. Propón leer el resto en voz alta.",
            }
          : {
              fr: "Je n'ai pas de numéro où envoyer les étapes. Propose de lire la suite à voix haute.",
              en: "I have no number to text the steps to. Offer to read the rest out loud.",
              es: "No tengo ningún número al que enviar los pasos. Propón leer el resto en voz alta.",
            };

  // Sans étape détaillée, « Pour commencer : » ne commence rien : on l'omet.
  const firstSteps = steps.slice(0, 2).join(t(session, { fr: " Puis : ", en: " Then: ", es: " Luego: " }));
  const opening = firstSteps
    ? t(session, { fr: ` Pour commencer : ${firstSteps}.`, en: ` To start: ${firstSteps}.`, es: ` Para empezar: ${firstSteps}.` })
    : "";
  return t(session, {
    fr: `Trajet de ${km} kilomètres, environ ${minutes} minutes ${args.mode === "driving" ? "en voiture" : "à pied"}.${opening} ${tail.fr}`,
    en: `A ${km}-kilometre trip, about ${minutes} minutes ${args.mode === "driving" ? "by car" : "on foot"}.${opening} ${tail.en}`,
    es: `Un trayecto de ${km} kilómetros, unos ${minutes} minutos ${args.mode === "driving" ? "en coche" : "a pie"}.${opening} ${tail.es}`,
  });
}
