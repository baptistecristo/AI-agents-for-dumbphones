"use client";

// La bascule de consentement de la démo : même pastille que la vraie page,
// mais l'état vit dans le composant — cliquer montre le geste, rien n'est
// enregistré nulle part. La mention sous la carte le dit en toutes lettres.

import { useState } from "react";

// Mêmes classes que web/src/app/tableau-de-bord/autorisations/page.tsx : la
// démo doit se lire pixel pour pixel comme le vrai registre.
const grantedPill =
  "inline-flex shrink-0 items-center rounded-full bg-ok/10 px-3.5 py-1.5 text-sm font-medium text-ok ring-1 ring-inset ring-ok/25 transition-colors hover:bg-ok/15";
const neutralPill =
  "inline-flex shrink-0 items-center rounded-full bg-cream-deep px-3.5 py-1.5 text-sm font-medium text-muted ring-1 ring-inset ring-line transition-colors hover:bg-line/60";

export function DemoConsentToggle({
  initial,
  grantedLabel,
  refusedLabel,
}: {
  initial: boolean;
  grantedLabel: string;
  refusedLabel: string;
}) {
  const [granted, setGranted] = useState(initial);
  return (
    <button
      type="button"
      aria-pressed={granted}
      onClick={() => setGranted(!granted)}
      className={granted ? grantedPill : neutralPill}
    >
      {granted ? grantedLabel : refusedLabel}
    </button>
  );
}
