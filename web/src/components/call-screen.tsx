"use client";

// L'écran d'appel vocal du héros. Un appel n'est pas un fil de SMS : ici on le
// montre pour ce qu'il est, une voix. Un minuteur qui tourne, une onde sonore
// qui respire, et la phrase en cours en sous-titre, qui défile ligne à ligne.
// Le transcript complet reste lisible aux lecteurs d'écran (sr-only).

import { useEffect, useState } from "react";

type Line = { who: "j" | "a"; text: string };

export function CallScreen({
  caption,
  lines,
  brand,
  ariaLabel,
}: {
  caption: string;
  lines: Line[];
  brand: string;
  ariaLabel: string;
}) {
  const [i, setI] = useState(0);
  const [secs, setSecs] = useState(0);

  // Le minuteur tourne pendant que l'appel « dure ».
  useEffect(() => {
    const tick = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, []);

  // Les répliques défilent, comme si on écoutait l'appel en direct.
  useEffect(() => {
    const next = setInterval(() => setI((n) => (n + 1) % lines.length), 3400);
    return () => clearInterval(next);
  }, [lines.length]);

  const line = lines[i];
  const speaker = line.who === "a" ? brand : "Sam";
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  return (
    <figure aria-label={ariaLabel} className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <div aria-hidden>
        <figcaption className="flex items-center justify-between gap-3 border-b border-line pb-4 text-sm text-muted">
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-clay" />
            <span className="truncate">{caption}</span>
          </span>
          <span className="shrink-0 tabular-nums text-ink/70">
            {mm}:{ss}
          </span>
        </figcaption>

        <div className="mt-6 flex items-center gap-4">
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
              line.who === "a" ? "bg-clay-tint text-clay" : "bg-cream-deep text-ink"
            }`}
          >
            {speaker}
          </span>
          <div className="flex h-9 flex-1 items-center justify-center gap-[3px] overflow-hidden">
            {Array.from({ length: 28 }).map((_, b) => (
              <span
                key={b}
                className="wave-bar w-[3px] rounded-full bg-clay/70"
                style={{ animationDelay: `${(b % 7) * 90}ms` }}
              />
            ))}
          </div>
        </div>

        <p key={i} className="call-line mt-5 min-h-[5.5rem] text-lg leading-snug text-ink">
          <span className="text-muted">« </span>
          {line.text}
          <span className="text-muted"> »</span>
        </p>
      </div>

      <div className="sr-only">
        {lines.map((l, k) => (
          <p key={k}>
            {l.who === "a" ? brand : "Sam"} : {l.text}
          </p>
        ))}
      </div>
    </figure>
  );
}
