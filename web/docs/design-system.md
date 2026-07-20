# Design system

Everything visual comes from one file: [`web/src/app/globals.css`](../src/app/globals.css).
Shared class strings live in [`web/src/components/styles.ts`](../src/components/styles.ts) and
the button in [`web/src/components/button.tsx`](../src/components/button.tsx). Nothing else
should hold a colour, a radius or a letter-spacing.

The look is warm ivory and clay: near-black warm ink on a light ivory ground, terracotta as
the single accent. No pure white, no bright chroma. Contrast comes from type and space, not
from colour.

## Two layers, and the order matters

`globals.css` defines colour twice on purpose.

**Primitives** are the raw values, grouped into ramps. Repainting the site means editing
these lines and nothing else.

```
--ivory-50 #faf9f5   --ink-500 #78736a   --clay-100 #ecdccf   --moss  #4f7a52
--ivory-100 #f0eee6  --ink-700 #46433b   --clay-400 #cc785c   --ochre #9a6a2f
--ivory-200 #e7e3d7  --ink-900 #14130f   --clay-600 #bd5b3a   --rust  #b0402f
--ivory-300 #d9d5c8
```

The hairline border sits at the dark end of the ivory ramp rather than in a grey of its own.
That is why there is no cool grey anywhere on the site.

**Roles** say what a colour is for. Components name roles, never primitives, because a role
survives a repaint and a value does not.

| Role | Primitive | Used for |
|---|---|---|
| `cream` | `ivory-100` | the page ground |
| `cream-deep` | `ivory-200` | alternate sections, quiet fills |
| `surface` | `ivory-50` | cards and inputs, a hair above the ground |
| `ink` | `ink-900` | headings, primary text |
| `slate` | `ink-700` | body copy |
| `muted` | `ink-500` | captions, secondary text |
| `line` | `ivory-300` | hairline borders |
| `clay` | `clay-600` | links, marks, the focus ring |
| `clay-soft` | `clay-400` | small tints |
| `clay-tint` | `clay-100` | washes, the agent's voice in the transcript |
| `ok` / `warn` / `danger` | `moss` / `ochre` / `rust` | status, used sparingly |

Roles become Tailwind utilities through `@theme inline`. A role that is not listed there has
no utility: that is what was wrong with `--color-danger` before it was mapped in `f69fe28`.
Add the role and its `@theme inline` line together, or the utility silently does not compile.

## Radii

Named by part, not by size. `rounded-card` stays true the day a card rounds off more;
`rounded-xl` becomes a lie.

| Token | Value | Used for |
|---|---|---|
| `rounded-chip` | 0.375rem | inline chips: typed keywords, row actions |
| `rounded-control` | 0.5rem | buttons and fields |
| `rounded-card` | 0.75rem | cards, bubbles, callouts |
| `rounded-panel` | 1rem | large panels: the call screen, the closing band |
| `rounded-full` | Tailwind's own | pills, status dots, avatars |

Buttons and fields deliberately share `rounded-control`: a button and the field it submits
must have the same corner.

## Type

The scale is Tailwind's default. What matters is the role each step plays.

| Step | Role |
|---|---|
| `text-hero` (2.6rem / 1.04) | the landing headline only, sized between `4xl` and `5xl` |
| `text-4xl` / `text-3xl` | section titles, via the `sectionTitle` string |
| `text-2xl` / `text-xl` / `text-lg` | card and subsection headings |
| `text-base` | long-form body copy |
| `text-sm` | the working size of the dashboard and of every form |
| `text-xs` | eyebrows, badges, table meta |

Two families: `font-display` (Fraunces) for headings and the wordmark, `font-sans` (Hanken
Grotesk) for everything else. Weights in use are `font-medium`, `font-semibold` and
`font-bold`; there is no light weight.

Two letter-spacing tokens carry meaning and are not decorative:

- `tracking-eyebrow` (0.14em) for the uppercase eyebrow above a section title
- `tracking-code` (0.5em) for the six-digit sign-in code, so it reads digit by digit

## Spacing

Tailwind's default 0.25rem scale, unchanged. Two conventions worth keeping:

- the page shell is `mx-auto max-w-6xl px-6`; section rhythm is `py-24` on the landing and
  `mb-10` between dashboard sections
- card padding is `p-5 sm:p-6` in the dashboard and `p-6` to `p-8` on the landing

## Motion

The site barely animates. Three durations, all in `globals.css`:

| Token | Value | Used for |
|---|---|---|
| `--motion-quick` | 150ms | hover and colour changes. Wired to Tailwind's `--default-transition-duration`, so `transition-colors` picks it up with no extra class |
| `--motion-entrance` | 500ms | a transcript line arriving |
| `--motion-breath` | 900ms | the sound wave breathing |

Everything animated is disabled under `prefers-reduced-motion: reduce`.

## Accessibility

One clay focus ring for the whole site, declared once as `:focus-visible` in `globals.css`.
Do not add per-element rings, and do not cancel the outline with a utility: a utility such as
`focus-visible:` plus an outline reset scores (0,2,0) against the global rule's (0,1,0) and
wins, which is how buttons lost their focus indicator until this was removed from
`button.tsx`.

### Contrast, measured

Ratios against the two grounds the site actually uses. AA needs 4.5:1 for normal text, 3:1
for text at 24px or 18.66px bold, and 3:1 for the boundary of a control you must be able to
find.

| Pair | Ratio | AA at normal size |
|---|---|---|
| `ink` on `cream` | 16.00:1 | pass |
| `ink` on `surface` | 17.64:1 | pass |
| `ink` on `cream-deep` | 14.49:1 | pass |
| `ink` on `clay-tint` | 13.90:1 | pass |
| `cream` on `ink` | 16.00:1 | pass |
| `slate` on `cream` | 8.50:1 | pass |
| `slate` on `surface` | 9.37:1 | pass |
| `clay-soft` on `ink` | 5.67:1 | pass |
| `danger` on `cream` | 4.99:1 | pass |
| `muted` on `surface` | 4.47:1 | **fails**, large text only |
| `ok` on `cream` | 4.27:1 | **fails**, large text only |
| `clay` on `surface` | 4.22:1 | **fails**, large text only |
| `muted` on `cream` | 4.05:1 | **fails**, large text only |
| `warn` on `cream` | 4.04:1 | **fails**, large text only |
| `clay` on `cream` | 3.83:1 | **fails**, large text only |
| `muted` on `cream-deep` | 3.67:1 | **fails**, large text only |
| `clay` on `cream-deep` | 3.47:1 | **fails**, large text only |
| `clay` on `clay-tint` | 3.33:1 | **fails**, large text only |
| `line` on `cream` | 1.26:1 | **fails** 1.4.11 for field borders |

### Known gaps

These are real and not yet fixed. Fixing them means darkening primitives, which is a
deliberate palette change, not a token change.

1. `muted` and `clay` are the two heaviest-used text colours after `ink`, and both sit under
   4.5:1 at `text-sm`. Every caption, hint and inline link on the site is affected.
   `--ink-500` would need to reach roughly `#6b665d`, and `--clay-600` roughly `#a94e30`.
2. `line` at 1.26:1 is fine as decoration between cards but is the only boundary a text input
   has, so fields fail WCAG 1.4.11. Inputs need a darker border than panels do, which means
   splitting `line` into two roles.
3. The focus ring itself passes: `clay` on `cream` is 3.83:1, above the 3:1 the ring needs.

### Checklist before shipping a screen

- text at `text-sm` uses `ink` or `slate`, not `muted` or `clay`, when it carries meaning
- every interactive element is reachable by keyboard and shows the clay ring
- nothing cancels `outline` on a focusable element
- colour is never the only signal: status dots pair with a word, `warn` pairs with an icon
- new animation is disabled under `prefers-reduced-motion`
- images have `alt`, decorative marks have `aria-hidden`

## Adding a token, or not

Reuse first. The bar for a new token is that it has a **role no existing token covers**, and
that it will be used more than once.

- **New colour**: only if the role is new. A new tint of an existing role is not a token, it
  is an opacity modifier (`bg-clay/10`). If you do add one, add the primitive, the role, and
  the `@theme inline` line together.
- **New radius**: no. Four steps plus `rounded-full` cover the site. A fifth means two parts
  disagree about what they are, which is the bug.
- **New size or spacing**: use Tailwind's scale. Add a token only when a value falls between
  two steps and recurs, which is the whole reason `text-hero` exists.
- **New shared class string**: put it in `styles.ts` and import it. Do not retype the
  literal. `card`, `eyebrow` and `sectionTitle` had been exported and then retyped by hand in
  six places, which is exactly how the near-misses in this file got there.

Known duplication left on purpose, worth folding in later: the page shell
(`mx-auto max-w-6xl px-6`) appears ten times, the status dot four times, and the dashboard
page title uses a slightly looser line-height than `sectionTitle` for no reason anyone
recorded.
