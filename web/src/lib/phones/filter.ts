// Filtrage + tri, purs et sans React, pour être testés seuls.

import type { FilterCriteria, Nav, Phone, Region } from "./types";

/** Prix pertinent selon la région (USD en Amérique, EUR ailleurs). */
export function priceFor(phone: Phone, region: Region | undefined): number | undefined {
  return region === "america" ? phone.priceUsd : phone.priceEur;
}

/** Un téléphone est-il disponible dans la région demandée ? */
function matchesRegion(phone: Phone, region: Region | undefined): boolean {
  if (!region) return true;
  if (region === "global") return phone.regions.includes("global");
  // Les téléphones « global » apparaissent aussi en Europe et en Amérique.
  return phone.regions.includes(region) || phone.regions.includes("global");
}

/** Le niveau de navigation du téléphone satisfait-il le besoin demandé ? */
function matchesNav(phone: Phone, nav: FilterCriteria["nav"]): boolean {
  if (!nav) return true;
  const navigates: Nav[] = ["full-maps", "basic-nav"];
  switch (nav) {
    case "full-maps":
      return phone.nav === "full-maps";
    case "any-nav":
      return navigates.includes(phone.nav);
    case "location-ok":
      return phone.nav !== "none";
  }
}

function matchesPrice(phone: Phone, criteria: FilterCriteria): boolean {
  if (criteria.maxPrice == null) return true;
  const price = priceFor(phone, criteria.region);
  // Prix inconnu : on ne peut pas exclure, on garde le téléphone.
  if (price == null) return true;
  return price <= criteria.maxPrice;
}

export function filterPhones(phones: Phone[], criteria: FilterCriteria = {}): Phone[] {
  return phones.filter(
    (p) =>
      matchesRegion(p, criteria.region) &&
      matchesNav(p, criteria.nav) &&
      (criteria.trueDumbphone == null || p.trueDumbphone === criteria.trueDumbphone) &&
      (criteria.formFactor == null || p.formFactor === criteria.formFactor) &&
      matchesPrice(p, criteria),
  );
}

/** Tri par prix croissant ; prix inconnus en dernier. */
export function sortByPrice(phones: Phone[], region: Region | undefined): Phone[] {
  return [...phones].sort((a, b) => {
    const pa = priceFor(a, region);
    const pb = priceFor(b, region);
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return pa - pb;
  });
}
