"use client";

// Zone dangereuse : la suppression du compte. On ne s'appuie pas sur un
// window.confirm (bloquant, illisible, inaccessible) — on demande de recopier
// une phrase à l'identique. Le bouton reste inerte tant que ça ne correspond pas,
// et le serveur revérifie la même phrase : le désarmement client n'est qu'un
// confort, pas la sécurité.

import { useState } from "react";
import { deleteAccount } from "./actions";
import { dangerBtn, inputCls } from "../ui";

const CONFIRM_PHRASE = "SUPPRIMER MON COMPTE";

export function DeleteAccount() {
  const [value, setValue] = useState("");
  const matches = value === CONFIRM_PHRASE;

  return (
    <div>
      <p className="text-neutral-700 dark:text-neutral-300">
        Supprimer ton compte efface tout, définitivement :
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-600 dark:text-neutral-400">
        <li>le compte et ton accès</li>
        <li>les numéros reliés</li>
        <li>tes notes et ta mémoire</li>
        <li>tes rappels</li>
        <li>ton historique d&apos;appels et de SMS</li>
      </ul>
      <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
        C&apos;est immédiat et sans retour. Personne, pas même le support, ne pourra les récupérer.
        Pense à exporter tes données avant, si tu veux les garder.
      </p>

      <form action={deleteAccount} className="mt-5 space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-ink dark:text-neutral-100">
            Pour confirmer, tape <span className="font-mono">SUPPRIMER MON COMPTE</span>
          </span>
          <input
            name="confirm"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-label="Tape SUPPRIMER MON COMPTE pour confirmer la suppression"
            placeholder="SUPPRIMER MON COMPTE"
            className={inputCls}
          />
        </label>
        <button type="submit" disabled={!matches} className={dangerBtn}>
          Supprimer définitivement mon compte
        </button>
      </form>
    </div>
  );
}
