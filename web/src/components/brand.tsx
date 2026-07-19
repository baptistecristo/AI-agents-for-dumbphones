// The wordmark: a hand-drawn handset mark in clay beside the name set in the
// display serif. A quiet line glyph rather than an emoji — the product is a
// phone you call, said once, calmly.

import Link from "next/link";

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? "Agent";

export function HandsetMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 16.9v2.6a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.7 2 2 0 0 1 4.1 2.5h2.7a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7.9 10.2a16 16 0 0 0 6 6l1.1-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2 font-display text-2xl leading-none text-ink ${className}`}
    >
      <HandsetMark className="h-[1.1rem] w-[1.1rem] text-clay" />
      <span>{brand}</span>
    </Link>
  );
}
