// Shared Tailwind class strings. Import these instead of retyping palette
// classes, so every form field, card, and label matches across the site.

// Text input / select surface.
export const field =
  "w-full rounded-lg border border-line bg-surface px-4 py-3 text-ink placeholder:text-muted transition-colors focus:border-clay";

// The small label above a field.
export const fieldLabel = "mb-1.5 block text-sm font-medium text-ink";

// A flat, hairline-bordered panel — the card style everywhere. No shadow.
export const card = "rounded-xl border border-line bg-surface";

// The uppercase clay eyebrow that sits above a section title.
export const eyebrow = "text-xs font-semibold uppercase tracking-[0.14em] text-clay";

// A section heading in the display serif.
export const sectionTitle = "font-display text-3xl leading-tight text-ink md:text-4xl";
