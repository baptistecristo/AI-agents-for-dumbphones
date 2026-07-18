// Skill Conversion — unités (table locale, sans API) + devises (frankfurter.app,
// gratuit et sans clé). On tente d'abord les unités ; si les deux côtés ne sont
// pas des unités connues, on les traite comme des codes de devise ISO.

import { safeFetch } from "../net";
import { CallSession, SkillResult, t } from "./types";

type Dim = "distance" | "weight" | "volume" | "speed" | "temp";

// Facteur vers l'unité de base de la dimension (mètre, gramme, litre, km/h).
// La température n'a pas de facteur : offset, traité à part.
const UNITS: Record<string, { dim: Dim; factor?: number; fr: string; en: string; es: string }> = {
  km: { dim: "distance", factor: 1000, fr: "kilomètres", en: "kilometres", es: "kilómetros" },
  m: { dim: "distance", factor: 1, fr: "mètres", en: "metres", es: "metros" },
  cm: { dim: "distance", factor: 0.01, fr: "centimètres", en: "centimetres", es: "centímetros" },
  mi: { dim: "distance", factor: 1609.344, fr: "miles", en: "miles", es: "millas" },
  ft: { dim: "distance", factor: 0.3048, fr: "pieds", en: "feet", es: "pies" },
  in: { dim: "distance", factor: 0.0254, fr: "pouces", en: "inches", es: "pulgadas" },
  kg: { dim: "weight", factor: 1000, fr: "kilos", en: "kilograms", es: "kilos" },
  g: { dim: "weight", factor: 1, fr: "grammes", en: "grams", es: "gramos" },
  lb: { dim: "weight", factor: 453.59237, fr: "livres", en: "pounds", es: "libras" },
  oz: { dim: "weight", factor: 28.349523, fr: "onces", en: "ounces", es: "onzas" },
  l: { dim: "volume", factor: 1, fr: "litres", en: "litres", es: "litros" },
  gal: { dim: "volume", factor: 3.785411784, fr: "gallons US", en: "US gallons", es: "galones estadounidenses" },
  galuk: { dim: "volume", factor: 4.54609, fr: "gallons britanniques", en: "imperial gallons", es: "galones imperiales" },
  kph: { dim: "speed", factor: 1, fr: "kilomètres heure", en: "kilometres per hour", es: "kilómetros por hora" },
  mph: { dim: "speed", factor: 1.609344, fr: "miles heure", en: "miles per hour", es: "millas por hora" },
  c: { dim: "temp", fr: "degrés Celsius", en: "degrees Celsius", es: "grados Celsius" },
  f: { dim: "temp", fr: "degrés Fahrenheit", en: "degrees Fahrenheit", es: "grados Fahrenheit" },
};

// Toutes les formes acceptées -> unité canonique de UNITS.
const ALIASES: Record<string, string> = {
  km: "km", kilometre: "km", kilometres: "km", kilometer: "km", kilometers: "km", "kilomètre": "km", "kilomètres": "km",
  "kilómetro": "km", "kilómetros": "km", kilometro: "km", kilometros: "km",
  m: "m", metre: "m", metres: "m", meter: "m", meters: "m", "mètre": "m", "mètres": "m", metro: "m", metros: "m",
  cm: "cm", centimetre: "cm", centimetres: "cm", centimeter: "cm", centimeters: "cm", "centimètre": "cm", "centimètres": "cm",
  "centímetro": "cm", "centímetros": "cm", centimetro: "cm", centimetros: "cm",
  mi: "mi", mile: "mi", miles: "mi", milla: "mi", millas: "mi",
  ft: "ft", foot: "ft", feet: "ft", pied: "ft", pieds: "ft", pie: "ft", pies: "ft",
  in: "in", inch: "in", inches: "in", pouce: "in", pouces: "in", pulgada: "in", pulgadas: "in",
  kg: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg", kilogramme: "kg", kilogrammes: "kg",
  kilogramo: "kg", kilogramos: "kg",
  g: "g", gram: "g", grams: "g", gramme: "g", grammes: "g", gramo: "g", gramos: "g",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb", livre: "lb", livres: "lb", libra: "lb", libras: "lb",
  oz: "oz", ounce: "oz", ounces: "oz", once: "oz", onces: "oz", onza: "oz", onzas: "oz",
  l: "l", litre: "l", litres: "l", liter: "l", liters: "l", litro: "l", litros: "l",
  // "gallon" seul = gallon US (le plus courant). L'impérial se demande explicitement.
  gal: "gal", gallon: "gal", gallons: "gal", "galón": "gal", galon: "gal", galones: "gal",
  "us gallon": "gal", "us gallons": "gal", usgal: "gal", "gallon us": "gal", "gallons us": "gal",
  "imperial gallon": "galuk", "imperial gallons": "galuk", "uk gallon": "galuk", "uk gallons": "galuk",
  ukgal: "galuk", "british gallon": "galuk", "british gallons": "galuk",
  "gallon impérial": "galuk", "gallons impériaux": "galuk", "gallon britannique": "galuk", "gallons britanniques": "galuk",
  "galón imperial": "galuk", "galones imperiales": "galuk",
  kph: "kph", kmh: "kph", "km/h": "kph",
  mph: "mph", "mi/h": "mph",
  c: "c", celsius: "c", centigrade: "c", "°c": "c",
  f: "f", fahrenheit: "f", "°f": "f",
};

// Noms parlés des devises courantes ; repli sur le code lui-même sinon.
const CURRENCIES: Record<string, { fr: string; en: string; es: string }> = {
  EUR: { fr: "euros", en: "euros", es: "euros" },
  USD: { fr: "dollars", en: "dollars", es: "dólares" },
  GBP: { fr: "livres sterling", en: "pounds", es: "libras esterlinas" },
  CHF: { fr: "francs suisses", en: "Swiss francs", es: "francos suizos" },
  JPY: { fr: "yens", en: "yen", es: "yenes" },
  CAD: { fr: "dollars canadiens", en: "Canadian dollars", es: "dólares canadienses" },
  AUD: { fr: "dollars australiens", en: "Australian dollars", es: "dólares australianos" },
};

function resolveUnit(s: string): string | null {
  const k = s.toLowerCase().trim().replace(/\.$/, "");
  return ALIASES[k] ?? null;
}

// Nombre pour la voix : arrondi, virgule décimale en français et en espagnol.
function fmt(n: number, language: string, decimals = 1): string {
  const s = String(Number(n.toFixed(decimals)));
  return language === "en" ? s : s.replace(".", ",");
}

function convertUnit(value: number, from: string, to: string): number {
  if (from === "c" || from === "f") {
    // temp : from et to sont c/f (même dimension garantie par l'appelant).
    if (from === to) return value;
    return from === "c" ? value * 1.8 + 32 : (value - 32) / 1.8;
  }
  const f = UNITS[from].factor as number;
  const tf = UNITS[to].factor as number;
  return (value * f) / tf;
}

function currencyName(code: string, language: "fr" | "en" | "es"): string {
  const c = CURRENCIES[code];
  return c ? c[language] : code;
}

export async function convert(
  session: CallSession,
  args: { value?: number; from?: string; to?: string },
): Promise<SkillResult> {
  const value = args.value;
  const from = args.from?.trim();
  const to = args.to?.trim();

  if (value == null || Number.isNaN(value) || !from || !to)
    return t(session, {
      fr: "Que dois-je convertir ? Dites une valeur, une unité de départ et une d'arrivée.",
      en: "What should I convert? Give a value, a source unit and a target unit.",
      es: "¿Qué debo convertir? Di un valor, una unidad de origen y una de destino.",
    });

  // 1) Unités.
  const fu = resolveUnit(from);
  const tu = resolveUnit(to);
  if (fu && tu) {
    if (UNITS[fu].dim !== UNITS[tu].dim)
      return t(session, {
        fr: `Je ne peux pas convertir des ${t(session, UNITS[fu])} en ${t(session, UNITS[tu])}.`,
        en: `I can't convert ${t(session, UNITS[fu])} to ${t(session, UNITS[tu])}.`,
        es: `No puedo convertir ${t(session, UNITS[fu])} a ${t(session, UNITS[tu])}.`,
      });
    const result = convertUnit(value, fu, tu);
    const decimals = UNITS[fu].dim === "temp" ? 0 : 1;
    return t(session, {
      fr: `${fmt(value, "fr", 2)} ${t(session, UNITS[fu])} font environ ${fmt(result, "fr", decimals)} ${t(session, UNITS[tu])}.`,
      en: `${fmt(value, "en", 2)} ${t(session, UNITS[fu])} is about ${fmt(result, "en", decimals)} ${t(session, UNITS[tu])}.`,
      es: `${fmt(value, "es", 2)} ${t(session, UNITS[fu])} son aproximadamente ${fmt(result, "es", decimals)} ${t(session, UNITS[tu])}.`,
    });
  }
  // Un seul côté est une unité connue : conversion impossible (ex. km -> kg, km -> EUR).
  if (fu || tu)
    return t(session, {
      fr: `Je ne peux pas convertir « ${from} » en « ${to} ».`,
      en: `I can't convert "${from}" to "${to}".`,
      es: `No puedo convertir «${from}» a «${to}».`,
    });

  // 2) Devises : codes ISO à 3 lettres.
  const fc = from.toUpperCase();
  const tc = to.toUpperCase();
  if (!/^[A-Z]{3}$/.test(fc) || !/^[A-Z]{3}$/.test(tc))
    return t(session, {
      fr: `Je ne sais pas convertir « ${from} » en « ${to} ».`,
      en: `I don't know how to convert "${from}" to "${to}".`,
      es: `No sé convertir «${from}» a «${to}».`,
    });

  if (fc === tc)
    return t(session, {
      fr: `${fmt(value, "fr", 2)} ${currencyName(fc, "fr")}, c'est la même chose.`,
      en: `${fmt(value, "en", 2)} ${currencyName(fc, "en")} is the same thing.`,
      es: `${fmt(value, "es", 2)} ${currencyName(fc, "es")}, es lo mismo.`,
    });

  const res = await safeFetch(`https://api.frankfurter.app/latest?amount=${value}&from=${fc}&to=${tc}`);
  if (!res.ok)
    return t(session, {
      fr: `Je ne peux pas convertir « ${from} » en « ${to} » — vérifiez les devises.`,
      en: `I can't convert "${from}" to "${to}" — check the currencies.`,
      es: `No puedo convertir «${from}» a «${to}» — revisa las divisas.`,
    });

  const data = (await res.json()) as { rates?: Record<string, number> };
  const converted = data.rates?.[tc];
  if (converted == null)
    return t(session, {
      fr: "Le service de taux de change ne répond pas, réessayez plus tard.",
      en: "The exchange rate service isn't responding, try again later.",
      es: "El servicio de tipo de cambio no responde, inténtalo más tarde.",
    });

  return t(session, {
    fr: `${fmt(value, "fr", 2)} ${currencyName(fc, "fr")} font environ ${fmt(converted, "fr", 2)} ${currencyName(tc, "fr")}.`,
    en: `${fmt(value, "en", 2)} ${currencyName(fc, "en")} is about ${fmt(converted, "en", 2)} ${currencyName(tc, "en")}.`,
    es: `${fmt(value, "es", 2)} ${currencyName(fc, "es")} son aproximadamente ${fmt(converted, "es", 2)} ${currencyName(tc, "es")}.`,
  });
}
