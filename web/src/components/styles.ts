// Chaînes de classes Tailwind partagées. On importe d'ici plutôt que de
// retaper les classes de la charte, pour que chaque champ, carte et étiquette
// se ressemblent d'une page à l'autre.
//
// Les classes ci-dessous ne citent aucune valeur brute : les rayons passent par
// les jetons `rounded-control` / `rounded-card` / `rounded-chip`, l'interlettrage
// par `tracking-eyebrow`. Voir web/docs/design-system.md avant d'en ajouter une.

// Surface d'un champ texte / d'un select. Bordure `line-strong` et pas `line` :
// un champ n'a que son contour pour dire où il commence, donc il tombe sous les
// 3:1 de WCAG 1.4.11, quand `line` est un filet décoratif à 1,26:1.
export const field =
  "w-full rounded-control border border-line-strong bg-surface px-4 py-3 text-ink placeholder:text-muted transition-colors focus:border-clay";

// La petite étiquette au-dessus d'un champ.
export const fieldLabel = "mb-1.5 block text-sm font-medium text-ink";

// L'aide sous un champ : la phrase qui explique, en gris.
export const hint = "mt-1.5 block text-sm text-muted";

// Un panneau plat, cerné d'un filet : la carte du site. Pas d'ombre.
export const card = "rounded-card border border-line bg-surface";

// Le surtitre argile en capitales, posé au-dessus d'un titre de section.
export const eyebrow = "text-xs font-semibold uppercase tracking-eyebrow text-clay";

// Un titre de section dans le serif d'affichage.
export const sectionTitle = "font-display text-3xl leading-tight text-ink md:text-4xl";

// Une puce en ligne : un mot-clé qu'on tape, cité au milieu d'une phrase.
export const chip =
  "rounded-chip bg-cream-deep px-1.5 py-0.5 font-mono text-xs font-semibold text-ink";
