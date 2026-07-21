// Kit visuel partagé de l'espace personnel. Server-safe (aucun hook client) :
// chaque page de section l'importe pour rester cohérente. L'identité reprend
// celle du site — le serif en surtitre, l'argile pour l'action et l'accent, et
// la bulle (« ce que ton agent saura / fera ») comme voix de l'agent.
// Pensé pour être lisible : contrastes francs, focus argile visible au clavier.

import type { ReactNode } from "react";
import { buttonClass } from "@/components/button";
import {
  card,
  eyebrow as eyebrowCls,
  field,
  fieldLabel as fieldLabelCls,
  hint,
} from "@/components/styles";

// ——— Classes réutilisables (formulaires, boutons) ———
// On s'appuie sur le kit partagé : mêmes champs, mêmes boutons que le reste du site.
export const inputCls = field;
export const selectCls = field;
export const textareaCls = `${field} min-h-28 resize-y leading-relaxed`;

export const primaryBtn = buttonClass({ variant: "primary" });
export const secondaryBtn = buttonClass({ variant: "ghost" });
// Action destructive : sobre, mais la brique « danger » signale qu'on ne revient pas en arrière.
export const dangerBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-control border border-danger/40 px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:pointer-events-none disabled:opacity-50";

export function fieldLabel(text: string): ReactNode {
  return <span className={fieldLabelCls}>{text}</span>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <span className={hint}>{children}</span>;
}

// Carte de contenu. La surface reste sobre ; la couleur sert l'action, pas le fond.
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${card} p-5 sm:p-6 ${className}`}>{children}</div>;
}

// Surtitre serif + titre + chapô : l'en-tête de chaque section.
export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <p className={eyebrowCls}>{eyebrow}</p>
      <h1 className="mt-2 font-display text-3xl text-ink md:text-4xl">{title}</h1>
      {children && <p className="mt-2 max-w-prose text-slate">{children}</p>}
    </div>
  );
}

// La signature : une bulle de parole. Elle dit, à la première personne de
// l'agent, ce que ce réglage lui apprend — le réglage vu depuis l'appel.
export function Bubble({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card border-l-2 border-clay bg-clay-tint px-4 py-3 text-sm leading-relaxed text-ink">
      {children}
    </div>
  );
}

// Écran vide : une invitation à agir, jamais un cul-de-sac.
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-card border border-dashed border-line p-5 text-sm text-muted">{children}</p>;
}

// Section d'une page (titre + contenu), pour rythmer les pages longues.
export function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-1 font-display text-lg text-ink">{title}</h2>
      {description && <p className="mb-3 max-w-prose text-sm text-muted">{description}</p>}
      <div className={description ? "" : "mt-3"}>{children}</div>
    </section>
  );
}
