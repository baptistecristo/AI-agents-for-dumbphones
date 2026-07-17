// Le modèle de données du comparateur de téléphones simples.
// Volontairement sans dépendance à React : ce fichier et `data.ts` sont la
// source de vérité, testables seuls.

/** Là où le téléphone marche vraiment (bandes) et se vend. */
export type Region = "europe" | "america" | "global";

export type FormFactor = "flip" | "candybar" | "touch" | "qwerty";

/**
 * Capacité de navigation réelle — pas « a une puce GPS ».
 * - `full-maps`     : Google Maps / navigation virage par virage
 * - `basic-nav`     : appli d'itinéraire maison, plus légère (Light Phone, Mudita)
 * - `location-only` : puce GPS utilisable seulement pour la localisation/urgence,
 *                     aucune carte (Punkt MP02, bouton d'assistance Doro)
 * - `none`          : pas de GPS exploitable
 */
export type Nav = "full-maps" | "basic-nav" | "location-only" | "none";

export type Os = "kaios" | "android-lite" | "proprietary" | "feature" | "series30";

/** Un texte disponible dans les trois langues de la page. */
export type LangText = { fr: string; en: string; es: string };

export type Lang = "fr" | "en" | "es";

export type Shop = {
  region: Region;
  /** Nom court du marchand, affiché sur le bouton (« Amazon.fr », « Light Phone »). */
  label: string;
  url: string;
};

export type Phone = {
  /** Slug stable, ex. « nokia-6300-4g ». */
  id: string;
  brand: string;
  name: string;
  /** Régions où les bandes/la disponibilité tiennent réellement. */
  regions: Region[];
  formFactor: FormFactor;
  os: Os;
  /** `false` = smartphone simplifié, pas un vrai téléphone simple. */
  trueDumbphone: boolean;
  nav: Nav;
  googleMaps: boolean;
  /** Prix indicatifs, volontairement approximatifs (ils bougent). */
  priceEur?: number;
  priceUsd?: number;
  blurb: LangText;
  /** Réserve honnête, ex. « Maps sur KaiOS est lent ; avenir non garanti ». */
  caveat?: LangText;
  shops: Shop[];
};

/** Critères de filtrage, tous optionnels — absent = « peu importe ». */
export type FilterCriteria = {
  region?: Region;
  /**
   * Besoin de navigation minimal demandé :
   * - `full-maps`     : uniquement les téléphones avec Google Maps/navigation complète
   * - `any-nav`       : navigation virage par virage (full-maps OU basic-nav)
   * - `location-ok`   : au moins une localisation (tout sauf `none`)
   * - undefined       : peu importe
   */
  nav?: "full-maps" | "any-nav" | "location-ok";
  /** `true` = vrais téléphones simples, `false` = smartphones simplifiés. */
  trueDumbphone?: boolean;
  formFactor?: FormFactor;
  /** Prix max, dans la devise de la région (EUR pour europe, USD pour america). */
  maxPrice?: number;
};
