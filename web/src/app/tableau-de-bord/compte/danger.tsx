"use client";

// Zone dangereuse : la suppression du compte. On ne s'appuie pas sur un
// window.confirm (bloquant, illisible, inaccessible) — on demande de recopier
// une phrase à l'identique. Le bouton reste inerte tant que ça ne correspond pas,
// et le serveur revérifie la même phrase : le désarmement client n'est qu'un
// confort, pas la sécurité. La phrase vit dans copy.ts, dans la langue du site.

import { useState } from "react";
import { Language } from "@/lib/language";
import { DASHBOARD } from "../copy";
import { deleteAccount } from "./actions";
import { inputCls } from "../ui";

// Bouton de suppression : clairement une mise en garde, mais retenu — un contour
// terracotta, jamais un aplat rouge criard. Le clay reste la seule couleur forte.
const dangerBtn =
  "inline-flex items-center justify-center rounded-lg border border-danger/40 px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/5 disabled:pointer-events-none disabled:opacity-50";

export function DeleteAccount({ lang }: { lang: Language }) {
  const tr = DASHBOARD[lang].compte.danger;
  const [value, setValue] = useState("");
  const matches = value === tr.confirmPhrase;

  return (
    <div>
      <p className="text-slate">
        {tr.intro}
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
        {tr.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">
        {tr.warning}
      </p>

      <form action={deleteAccount} className="mt-5 space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            {tr.confirmLabelBefore}<span className="font-mono">{tr.confirmPhrase}</span>
          </span>
          <input
            name="confirm"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-label={tr.confirmAria}
            placeholder={tr.confirmPhrase}
            className={inputCls}
          />
        </label>
        <button type="submit" disabled={!matches} className={dangerBtn}>
          {tr.deleteButton}
        </button>
      </form>
    </div>
  );
}
