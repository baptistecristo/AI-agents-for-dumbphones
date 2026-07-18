"use client";

// Le comparateur interactif : état des filtres, bascule FR/EN/ES, cartes.
// Toute la logique de filtrage vit dans `lib/phones/filter.ts` (testée seule).

import Image from "next/image";
import { type ReactNode, useMemo, useState } from "react";
import { PHONES } from "@/lib/phones/data";
import { filterPhones, priceFor, sortByPrice } from "@/lib/phones/filter";
import { t } from "@/lib/phones/i18n";
import type { FilterCriteria, FormFactor, Lang, Nav, Phone, Region } from "@/lib/phones/types";

const REGIONS: Region[] = ["europe", "america", "global"];
const NAV_NEEDS: NonNullable<FilterCriteria["nav"]>[] = ["full-maps", "any-nav", "location-ok"];
const FORMS: FormFactor[] = ["flip", "candybar", "touch", "qwerty"];
const PRICE_STEPS = [50, 100, 200, 400, 800];

// Couleur du badge de navigation : argile = vraie nav, alerte douce = partielle, neutre = aucune.
const NAV_TONE: Record<Nav, string> = {
  "full-maps": "bg-clay-tint text-clay",
  "basic-nav": "bg-clay-tint text-clay",
  "location-only": "bg-cream-deep text-warn",
  none: "bg-cream-deep text-muted",
};

function currency(region: Region) {
  return region === "america" ? "$" : "€";
}

export default function Finder({ initialLang = "fr" }: { initialLang?: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [region, setRegion] = useState<Region>("europe");
  const [nav, setNav] = useState<FilterCriteria["nav"]>(undefined);
  const [trueOnly, setTrueOnly] = useState<boolean | undefined>(undefined);
  const [form, setForm] = useState<FormFactor | undefined>(undefined);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);

  const tr = t(lang);

  const results = useMemo(() => {
    const criteria: FilterCriteria = { region, nav, trueDumbphone: trueOnly, formFactor: form, maxPrice };
    return sortByPrice(filterPhones(PHONES, criteria), region);
  }, [region, nav, trueOnly, form, maxPrice]);

  // La région n'est pas un « filtre » qu'on remet à zéro : elle définit le contexte.
  const anyActive = nav !== undefined || trueOnly !== undefined || form !== undefined || maxPrice !== undefined;

  function reset() {
    setNav(undefined);
    setTrueOnly(undefined);
    setForm(undefined);
    setMaxPrice(undefined);
  }

  const selectClass =
    "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink transition-colors focus:border-clay";
  const labelClass = "mb-1 block text-xs font-bold uppercase tracking-wide text-muted";

  return (
    <div>
      {/* Titre + bascule de langue */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <h1 className="font-display text-3xl leading-tight text-ink md:text-4xl">{tr.pageTitle}</h1>
        <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-line text-xs font-semibold">
          {(["fr", "en", "es"] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={`px-2.5 py-1.5 transition-colors ${
                lang === l ? "bg-ink text-cream" : "bg-surface text-muted hover:bg-cream-deep hover:text-ink"
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-8 max-w-2xl leading-relaxed text-slate">{tr.intro}</p>

      {/* Panneau de filtres — surface claire sur le fond, une seule hairline */}
      <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelClass} htmlFor="f-region">
              {tr.region}
            </label>
            <select
              id="f-region"
              className={selectClass}
              value={region}
              onChange={(e) => setRegion(e.target.value as Region)}
            >
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {tr.regions[r]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="f-nav">
              {tr.navNeed}
            </label>
            <select
              id="f-nav"
              className={selectClass}
              value={nav ?? ""}
              onChange={(e) => setNav((e.target.value || undefined) as FilterCriteria["nav"])}
            >
              <option value="">{tr.any}</option>
              {NAV_NEEDS.map((n) => (
                <option key={n} value={n}>
                  {tr.navNeeds[n]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="f-type">
              {tr.type}
            </label>
            <select
              id="f-type"
              className={selectClass}
              value={trueOnly === undefined ? "" : String(trueOnly)}
              onChange={(e) => setTrueOnly(e.target.value === "" ? undefined : e.target.value === "true")}
            >
              <option value="">{tr.any}</option>
              <option value="true">{tr.types.true}</option>
              <option value="false">{tr.types.false}</option>
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="f-form">
              {tr.form}
            </label>
            <select
              id="f-form"
              className={selectClass}
              value={form ?? ""}
              onChange={(e) => setForm((e.target.value || undefined) as FormFactor | undefined)}
            >
              <option value="">{tr.any}</option>
              {FORMS.map((f) => (
                <option key={f} value={f}>
                  {tr.forms[f]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="f-price">
              {tr.maxPrice}
            </label>
            <select
              id="f-price"
              className={selectClass}
              value={maxPrice ?? ""}
              onChange={(e) => setMaxPrice(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">{tr.any}</option>
              {PRICE_STEPS.map((p) => (
                <option key={p} value={p}>
                  {currency(region)} {p}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Avertissement bandes */}
      <p className="mt-4 flex items-start gap-2 text-sm text-warn">
        <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
        <span>{tr.bandWarning}</span>
      </p>

      {/* Compteur + réinitialisation (seulement quand un filtre est actif) */}
      <div className="mt-10 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-xl font-semibold text-ink">{tr.results(results.length)}</p>
        <div className="flex items-center gap-4 text-xs text-muted">
          {anyActive && (
            <button onClick={reset} className="font-medium text-clay underline-offset-2 hover:underline">
              {tr.reset}
            </button>
          )}
          <span>{tr.priceNote}</span>
        </div>
      </div>

      {/* Résultats */}
      {results.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-line bg-surface p-8 text-center text-muted">
          {tr.empty}
        </p>
      ) : (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((p) => (
            <PhoneCard key={p.id} phone={p} lang={lang} region={region} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PhoneCard({ phone, lang, region }: { phone: Phone; lang: Lang; region: Region }) {
  const tr = t(lang);
  const price = priceFor(phone, region);
  const shop =
    phone.shops.find((s) => s.region === region) ??
    phone.shops.find((s) => s.region === "global") ??
    phone.shops[0];

  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-clay/40">
      {/* Photo — silhouette selon le format tant qu'aucune image n'est fournie */}
      <div className="relative aspect-[4/3] border-b border-line bg-surface">
        {phone.image ? (
          <Image
            src={phone.image}
            alt={`${phone.brand} ${phone.name}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-contain p-4"
          />
        ) : (
          <PhoneGlyph formFactor={phone.formFactor} />
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg leading-tight text-ink">
            {phone.brand} {phone.name}
          </h3>
          <p className="mt-0.5 text-sm text-muted">
            {tr.forms[phone.formFactor]} · {tr.osLabels[phone.os]}
          </p>
        </div>
        {price != null && (
          <p className="whitespace-nowrap text-lg font-bold tabular-nums text-ink">
            <span className="mr-0.5 font-normal text-muted">≈</span>
            {currency(region)}
            {price}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${NAV_TONE[phone.nav]}`}>
          {tr.navBadges[phone.nav]}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
            phone.trueDumbphone ? "bg-clay-tint text-clay" : "bg-clay-tint text-ink"
          }`}
        >
          {phone.trueDumbphone ? tr.trueBadge : tr.smartBadge}
        </span>
      </div>

      <p className="mt-3 flex-1 text-sm leading-relaxed text-slate">{phone.blurb[lang]}</p>

      {phone.caveat && (
        <p className="mt-2 flex items-start gap-1.5 text-sm leading-relaxed text-warn">
          <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
          <span>{phone.caveat[lang]}</span>
        </p>
      )}

      {shop && (
        <a
          href={shop.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-1.5 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-clay transition-colors hover:bg-cream-deep"
        >
          {tr.shopAt} {shop.label}
          <span aria-hidden className="text-xs">
            ↗
          </span>
        </a>
      )}
      </div>
    </li>
  );
}

// Silhouette du téléphone selon son format, tant qu'aucune photo n'est fournie.
// Un simple repère visuel, honnête : ce n'est pas une vraie photo du modèle.
function PhoneGlyph({ formFactor }: { formFactor: FormFactor }) {
  const paths: Record<FormFactor, ReactNode> = {
    candybar: (
      <>
        <rect x="8" y="1.5" width="8" height="21" rx="2" />
        <rect x="9.75" y="3.5" width="4.5" height="6" rx="0.5" />
        <line x1="10" y1="12.5" x2="14" y2="12.5" />
        <line x1="10" y1="15" x2="14" y2="15" />
        <line x1="10" y1="17.5" x2="14" y2="17.5" />
      </>
    ),
    flip: (
      <>
        <rect x="8" y="1.5" width="8" height="10" rx="1.5" />
        <rect x="8" y="12.5" width="8" height="10" rx="1.5" />
        <rect x="9.75" y="3" width="4.5" height="6" rx="0.5" />
        <line x1="10.5" y1="15" x2="13.5" y2="15" />
        <line x1="10.5" y1="17.5" x2="13.5" y2="17.5" />
        <line x1="10.5" y1="20" x2="13.5" y2="20" />
      </>
    ),
    touch: (
      <>
        <rect x="7.5" y="1.5" width="9" height="21" rx="2" />
        <rect x="9" y="4" width="6" height="13" rx="0.5" />
        <circle cx="12" cy="20" r="0.9" />
      </>
    ),
    qwerty: (
      <>
        <rect x="5" y="4" width="14" height="16" rx="2" />
        <rect x="7" y="6" width="10" height="5" rx="0.5" />
        <line x1="7.5" y1="13.5" x2="16.5" y2="13.5" />
        <line x1="7.5" y1="16" x2="16.5" y2="16" />
        <line x1="7.5" y1="18.5" x2="16.5" y2="18.5" />
      </>
    ),
  };
  return (
    <div className="absolute inset-0 flex items-center justify-center text-line">
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="h-16 w-16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      >
        {paths[formFactor]}
      </svg>
    </div>
  );
}
