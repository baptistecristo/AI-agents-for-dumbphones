// Kit visuel partagé de l'espace personnel. Server-safe (aucun hook client) :
// chaque page de section l'importe pour rester cohérente. L'identité tient dans
// trois choses — le serif Young Serif en surtitre, le bleu de la marque pour
// l'action, et la bulle (« ce que ton agent saura / fera ») comme signature.
// Tout est pensé pour être lisible : contrastes francs, focus visible au clavier.

import type { ReactNode } from "react";

// ——— Classes réutilisables (formulaires, boutons) ———
// Anneau de focus visible partout : l'accessibilité est le produit, jusqu'au clavier.
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bleu focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950";

export const inputCls = `w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base text-ink placeholder:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 ${focusRing}`;
export const selectCls = inputCls;
export const textareaCls = `${inputCls} min-h-28 resize-y leading-relaxed`;

export const primaryBtn = `inline-flex items-center justify-center rounded-lg bg-bleu px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-bleu-fonce disabled:opacity-50 ${focusRing}`;
export const secondaryBtn = `inline-flex items-center justify-center rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-900 ${focusRing}`;
export const dangerBtn = `inline-flex items-center justify-center rounded-lg border border-red-300 px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40 ${focusRing}`;

export function fieldLabel(text: string): ReactNode {
  return <span className="mb-1.5 block text-sm font-bold text-ink dark:text-neutral-100">{text}</span>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <span className="mt-1.5 block text-sm text-neutral-500 dark:text-neutral-400">{children}</span>;
}

// Carte de contenu. La surface reste sobre ; la couleur sert l'action, pas le fond.
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900/50 sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

// Surtitre serif + titre + chapô : l'en-tête de chaque section.
export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <p className="font-display text-sm uppercase tracking-[0.2em] text-bleu dark:text-bulle">{eyebrow}</p>
      <h1 className="mt-1 font-display text-3xl text-ink dark:text-neutral-50">{title}</h1>
      {children && <p className="mt-2 max-w-prose text-neutral-600 dark:text-neutral-400">{children}</p>}
    </div>
  );
}

// La signature : une bulle de parole. Elle dit, à la première personne de
// l'agent, ce que ce réglage lui apprend — le réglage vu depuis l'appel.
export function Bubble({ children }: { children: ReactNode }) {
  return (
    <div className="relative rounded-2xl rounded-bl-sm bg-bulle px-4 py-3 text-sm leading-relaxed text-bleu-fonce dark:bg-bleu-fonce/30 dark:text-bulle">
      <span aria-hidden className="mr-1.5 select-none">💬</span>
      {children}
    </div>
  );
}

// Écran vide : une invitation à agir, jamais un cul-de-sac.
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-neutral-300 p-5 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">{children}</p>;
}

// Section d'une page (titre + contenu), pour rythmer les pages longues.
export function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-1 text-lg font-bold text-ink dark:text-neutral-100">{title}</h2>
      {description && <p className="mb-3 max-w-prose text-sm text-neutral-500 dark:text-neutral-400">{description}</p>}
      <div className={description ? "" : "mt-3"}>{children}</div>
    </section>
  );
}
