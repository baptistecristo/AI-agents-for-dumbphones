// Dictionnaire d'étiquettes FR/EN pour le comparateur. Pas de librairie i18n :
// une seule page bilingue, un simple objet suffit.

import type { FormFactor, Lang, Nav, Os, Region } from "./types";

export const UI = {
  fr: {
    pageTitle: "Trouve ton téléphone simple",
    intro:
      "Réponds à quelques questions et vois les téléphones qui te correspondent. On distingue la vraie navigation d'une simple puce GPS, et un vrai téléphone simple d'un smartphone déguisé.",
    bandWarning:
      "Vérifie toujours les bandes 4G de ton opérateur avant d'acheter : un modèle importé peut ne pas capter chez toi.",
    region: "Ta région",
    navNeed: "Navigation",
    type: "Type de téléphone",
    form: "Format",
    maxPrice: "Prix max",
    sort: "Trier par prix",
    reset: "Réinitialiser",
    results: (n: number) => `${n} téléphone${n > 1 ? "s" : ""}`,
    empty: "Aucun téléphone ne correspond. Essaie d'assouplir un filtre (le prix ou la navigation).",
    shopAt: "Voir chez",
    approxPrice: "≈",
    any: "Peu importe",
    priceNote: "Prix indicatifs, ils bougent.",
    // valeurs
    regions: { europe: "Europe", america: "Amérique du Nord", global: "International" } as Record<Region, string>,
    navNeeds: {
      "full-maps": "Google Maps / navigation complète",
      "any-nav": "Navigation virage par virage",
      "location-ok": "Localisation suffit",
    },
    types: { true: "Vrai téléphone simple", false: "Smartphone simplifié" },
    forms: { flip: "Clapet", candybar: "Barre", touch: "Tactile", qwerty: "Clavier QWERTY" } as Record<FormFactor, string>,
    navBadges: {
      "full-maps": "Google Maps",
      "basic-nav": "Navigation maison",
      "location-only": "GPS localisation seule",
      none: "Pas de GPS",
    } as Record<Nav, string>,
    trueBadge: "Vrai téléphone simple",
    smartBadge: "Smartphone simplifié",
    osLabels: {
      kaios: "KaiOS",
      "android-lite": "Android allégé",
      proprietary: "OS maison",
      feature: "Feature phone",
      series30: "Série 30+",
    } as Record<Os, string>,
  },
  en: {
    pageTitle: "Find your dumbphone",
    intro:
      "Answer a few questions and see the phones that fit you. We separate real navigation from a bare GPS chip, and a true dumbphone from a smartphone in disguise.",
    bandWarning:
      "Always check your carrier's 4G bands before buying: an imported model may not get signal where you live.",
    region: "Your region",
    navNeed: "Navigation",
    type: "Phone type",
    form: "Form factor",
    maxPrice: "Max price",
    sort: "Sort by price",
    reset: "Reset",
    results: (n: number) => `${n} phone${n > 1 ? "s" : ""}`,
    empty: "No phone matches. Try relaxing a filter (price or navigation).",
    shopAt: "Shop at",
    approxPrice: "≈",
    any: "Any",
    priceNote: "Prices are approximate and drift.",
    regions: { europe: "Europe", america: "North America", global: "Global" } as Record<Region, string>,
    navNeeds: {
      "full-maps": "Google Maps / full navigation",
      "any-nav": "Turn-by-turn navigation",
      "location-ok": "Location is enough",
    },
    types: { true: "True dumbphone", false: "Simplified smartphone" },
    forms: { flip: "Flip", candybar: "Candybar", touch: "Touch", qwerty: "QWERTY" } as Record<FormFactor, string>,
    navBadges: {
      "full-maps": "Google Maps",
      "basic-nav": "Own maps app",
      "location-only": "GPS location only",
      none: "No GPS",
    } as Record<Nav, string>,
    trueBadge: "True dumbphone",
    smartBadge: "Simplified smartphone",
    osLabels: {
      kaios: "KaiOS",
      "android-lite": "Lite Android",
      proprietary: "In-house OS",
      feature: "Feature phone",
      series30: "Series 30+",
    } as Record<Os, string>,
  },
} as const;

export function t(lang: Lang) {
  return UI[lang];
}
