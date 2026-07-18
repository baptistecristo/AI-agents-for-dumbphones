// The one button in the system. Renders an <a> when `href` is set, a <button>
// otherwise, so links and form-submit actions share a single look.
//   primary — near-black ink on cream, the main action
//   accent  — clay, used sparingly for the one call that should feel warm
//   ghost   — hairline outline, secondary and quiet

import type { ComponentPropsWithoutRef, ReactNode } from "react";

type Variant = "primary" | "accent" | "ghost";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";

const VARIANT: Record<Variant, string> = {
  primary: "bg-ink text-cream hover:bg-ink/85",
  accent: "bg-clay text-cream hover:bg-clay/90",
  ghost: "border border-line bg-transparent text-ink hover:bg-cream-deep",
};

const SIZE: Record<Size, string> = {
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3.5 text-base",
};

export function buttonClass(opts: { variant?: Variant; size?: Size; className?: string } = {}) {
  const { variant = "primary", size = "md", className = "" } = opts;
  return `${base} ${VARIANT[variant]} ${SIZE[size]} ${className}`.trim();
}

type Common = { variant?: Variant; size?: Size; children: ReactNode; className?: string };
type ButtonProps = Common &
  (({ href: string } & ComponentPropsWithoutRef<"a">) | ({ href?: undefined } & ComponentPropsWithoutRef<"button">));

export function Button({ variant, size, className, href, children, ...rest }: ButtonProps) {
  const cls = buttonClass({ variant, size, className });
  if (href !== undefined) {
    return (
      <a href={href} className={cls} {...(rest as ComponentPropsWithoutRef<"a">)}>
        {children}
      </a>
    );
  }
  return (
    <button className={cls} {...(rest as ComponentPropsWithoutRef<"button">)}>
      {children}
    </button>
  );
}
