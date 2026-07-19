// The marketing footer, shared by the public pages. Quiet: a hairline rule,
// the wordmark, the tagline, and one optional slot on the right.

import type { ReactNode } from "react";
import { HandsetMark } from "./brand";

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? "Agent";

export function SiteFooter({ tagline, right }: { tagline: string; right?: ReactNode }) {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-10 text-sm text-muted">
        <p className="inline-flex items-center gap-2">
          <HandsetMark className="h-4 w-4 text-clay" />
          <span className="font-display text-base text-ink">{brand}</span>
          <span className="text-muted">— {tagline}</span>
        </p>
        {right ?? null}
      </div>
    </footer>
  );
}
