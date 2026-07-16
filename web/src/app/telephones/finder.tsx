"use client";

// Le comparateur interactif : état des filtres, bascule FR/EN, cartes.
// Toute la logique de filtrage vit dans `lib/phones/filter.ts` (testée seule).

import { useMemo, useState } from "react";
import { PHONES } from "@/lib/phones/data";
import { filterPhones, priceFor, sortByPrice } from "@/lib/phones/filter";
import { t } from "@/lib/phones/i18n";
import type { FilterCriteria, FormFactor, Lang, Nav, Phone, Region } from "@/lib/phones/types";

const REGIONS: Region[] = ["europe", "america", "global"];
const NAV_NEEDS: NonNullable<FilterCriteria["nav"]>[] = ["full-maps", "any-nav", "location-ok"];
const FORMS: FormFactor[] = ["flip", "candybar", "touch", "qwerty"];
const PRICE_STEPS = [50, 100, 200, 400, 800];

// Couleur du badge de navigation : vert = vraie nav, ambre = partielle, gris = aucune.
const NAV_TONE: Record<Nav, string> = {
  "full-maps": "bg-emerald-100 text-emerald-900",
  "basic-nav": "bg-emerald-100 text-emerald-900",
  "location-only": "bg-amber-100 text-amber-900",
  none: "bg-ink/10 text-ink/60",
};

function currency(region: Region) {
  return region === "america" ? "$" : "€";
}

export default function Finder() {
  const [lang, setLang] = useState<Lang>("fr");
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

  function reset() {
    setNav(undefined);
    setTrueOnly(undefined);
    setForm(undefined);
    setMaxPrice(undefined);
  }

  const selectClass =
    "w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:border-bleu focus:outline-none";
  const labelClass = "block text-xs font-bold uppercase tracking-wide text-ink/50";

  return (
    <div>
      {/* Titre + bascule de langue */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <h1 className="font-display text-4xl leading-tight md:text-5xl">{tr.pageTitle}</h1>
        <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-ink/15 text-sm font-bold">
          {(["fr", "en"] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={`px-3 py-1.5 transition ${lang === l ? "bg-bleu text-white" : "bg-white text-ink/60 hover:bg-bulle"}`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-8 max-w-2xl leading-relaxed text-ink/75">{tr.intro}</p>

      {/* Panneau de filtres */}
      <div className="rounded-2xl border border-ink/10 bg-paper p-5">
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

          <div className="flex items-end">
            <button
              onClick={reset}
              className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-sm font-bold text-ink/70 transition hover:bg-bulle"
            >
              {tr.reset}
            </button>
          </div>
        </div>
      </div>

      {/* Avertissement bandes */}
      <p className="mt-4 flex items-start gap-2 text-sm text-ink/60">
        <span aria-hidden>📶</span>
        <span>{tr.bandWarning}</span>
      </p>

      {/* Compteur */}
      <div className="mt-8 flex items-baseline justify-between">
        <p className="font-display text-2xl">{tr.results(results.length)}</p>
        <p className="text-xs text-ink/50">{tr.priceNote}</p>
      </div>

      {/* Résultats */}
      {results.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-ink/20 bg-paper p-8 text-center text-ink/60">
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
    <li className="flex flex-col rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold leading-tight">
            {phone.brand} {phone.name}
          </h3>
          <p className="mt-0.5 text-sm text-ink/55">
            {tr.forms[phone.formFactor]} · {tr.osLabels[phone.os]}
          </p>
        </div>
        {price != null && (
          <p className="flex items-baseline gap-0.5 whitespace-nowrap">
            <span className="text-xs text-ink/40">~</span>
            <span className="text-lg font-bold tabular-nums text-ink">
              {currency(region)}
              {price}
            </span>
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${NAV_TONE[phone.nav]}`}>
          {tr.navBadges[phone.nav]}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
            phone.trueDumbphone ? "bg-bulle text-bleu" : "bg-jaune/30 text-ink/80"
          }`}
        >
          {phone.trueDumbphone ? tr.trueBadge : tr.smartBadge}
        </span>
      </div>

      <p className="mt-3 flex-1 text-sm leading-relaxed text-ink/75">{phone.blurb[lang]}</p>

      {phone.caveat && (
        <p className="mt-2 flex items-start gap-1.5 text-sm leading-relaxed text-amber-800">
          <span aria-hidden>⚠</span>
          <span>{phone.caveat[lang]}</span>
        </p>
      )}

      {shop && (
        <a
          href={shop.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block rounded-lg border border-bleu/20 bg-bleu/5 px-4 py-2.5 text-center transition hover:border-bleu/50 hover:bg-bleu/10"
        >
          <span className="block text-[11px] font-bold uppercase tracking-wide text-ink/45">{tr.shopAt}:</span>
          <span className="mt-0.5 inline-flex items-center gap-1 text-base font-bold text-bleu">
            {shop.label}
            <span aria-hidden className="text-xs">
              ↗
            </span>
          </span>
        </a>
      )}
    </li>
  );
}
