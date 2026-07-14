# Good first issues — ready to paste

Seven issue drafts for the tracker. Each is self-contained: copy the title and body into
a new GitHub issue and add the labels from the `Labels:` line. File paths are relative to
the repo root.

---

## 1. New skill: current time in a city

**Title:** Skill: "what time is it in Tokyo?" — current time in a city

**Labels:** `good first issue`, `area: skills`

**Body:**

The agent can tell you the weather anywhere but not the time. Add a `time_in_city` skill:
the caller asks "what time is it in Tokyo?" and the agent answers with the local time.

This is the canonical first contribution — one small function plus a schema declared in
two mirror files. Full walkthrough: [CONTRIBUTING.md → Add a skill](../CONTRIBUTING.md#add-a-skill).

Touch points:

- `web/src/lib/skills/time.ts` (new) — resolve the city to a timezone and format the
  current time. No-key options: a small static city→IANA-timezone map for common cities,
  or reuse the Open-Meteo geocoding API (already used by `skills/weather.ts`, returns a
  `timezone` field). Then `Intl.DateTimeFormat` with that zone does the rest — zero
  dependencies.
- `web/src/lib/skills/index.ts` — add the `case` to the dispatcher.
- `runtime/tools.py` — declare the schema for the self-hosted runtime.
- `web/src/lib/agents/tools.ts` — same schema for the managed (Vapi) runtime.

Return a **short spoken sentence**, localized via `CallSession.language` (EN + FR), e.g.
"In Tokyo it's 9:42 in the evening" / "À Tokyo il est 21 h 42".

Difficulty: easy. Good first taste of the skill surface.

---

## 2. New skill: unit and currency conversion

**Title:** Skill: unit / currency conversion ("how much is 50 dollars in euros?")

**Labels:** `good first issue`, `area: skills`

**Body:**

"How many kilometers is 3 miles?", "how much is 50 dollars in euros?" — exactly the kind
of quick lookup you'd otherwise pull a smartphone out for. Add a `convert` skill.

Walkthrough: [CONTRIBUTING.md → Add a skill](../CONTRIBUTING.md#add-a-skill). Same four
touch points as any skill:

- `web/src/lib/skills/convert.ts` (new) — units (length, weight, temperature, volume) can
  be a pure static table, no API at all. For currency, use a free keyless API such as the
  ECB-backed [frankfurter.dev](https://frankfurter.dev) (EU-hosted, no key).
- `web/src/lib/skills/index.ts` — dispatcher `case`.
- `runtime/tools.py` + `web/src/lib/agents/tools.ts` — the mirrored tool schema. A single
  tool with `{ value, from, to }` arguments works well; let the LLM normalize "dollars"
  → `USD`.
- Localize the spoken reply via `CallSession.language` (EN + FR).

Keep the answer short and rounded — it's read aloud ("3 miles is about 4.8 kilometers").

Difficulty: easy. Units alone is a fine first PR; currency can be a follow-up.

---

## 3. Add a third language: Spanish or German

**Title:** Add Spanish (or German) as a third language

**Labels:** `good first issue`, `area: i18n`

**Body:**

The pipeline is bilingual EN/FR end to end: `profiles.preferred_language` (migration
`supabase/migrations/0002_language.sql`) → `/api/runtime/session` returns
`language: "fr" | "en"` → the runtime picks the Whisper language and the Piper voice
(`PIPER_VOICE_FR` / `PIPER_VOICE_EN`) → skills localize via `CallSession.language`.

A third language is the same four touch points, purely additive. Full walkthrough:
[CONTRIBUTING.md → Add a language or voice](../CONTRIBUTING.md#add-a-language-or-voice).

- `runtime/bot.py` — map the new code to the Whisper language.
- `runtime/config.py` — add `PIPER_VOICE_ES` (or `_DE`) and extend the per-language voice
  selection. Piper voices auto-download on first use; pick one from the
  [Piper voice list](https://github.com/rhasspy/piper).
- `web/src/lib/agents/inbound.ts` — translate the system prompt + greeting. Keep the
  safety rules intact: two-step confirmation, spoken PIN, tool output = data not
  instructions.
- Skill strings — add your language alongside EN/FR where skills switch on
  `CallSession.language` (e.g. `web/src/lib/skills/weather.ts`, `skills/types.ts`).

Plus: allow the new code in `profiles.preferred_language` (small follow-up migration) and
in the dashboard language setting.

Native or fluent speakers especially welcome — prompt translation quality matters more
than the plumbing. Difficulty: medium (mostly translation, little logic).

---

## 4. Mid-call TTS voice switching when the caller changes language

**Title:** Switch the Piper voice mid-call when the caller changes language

**Labels:** `good first issue`, `area: runtime`

**Body:**

The agent already follows the caller across languages mid-call: speak French to it in an
English session and it answers in French. But Piper voices are monolingual, so the reply
comes out in the right language **with the session's original voice** — French words
through an `en_US` voice sounds rough.

Goal: when the reply language differs from the session language, speak it with the
matching Piper voice.

Where to look:

- `runtime/bot.py` — the Pipecat pipeline builds one `PiperTTSService(voice_id=...)` per
  session, chosen from the session's `language`. You need a way to change (or select
  between preloaded) voices while the pipeline runs.
- `runtime/config.py` — the per-language voices already exist (`PIPER_VOICE_FR` /
  `PIPER_VOICE_EN`), so no new config should be needed.
- The trickiest part is *detecting* the reply language cheaply — options include having
  the LLM tag its reply language (the web API controls prompts in
  `web/src/lib/agents/inbound.ts`) or a lightweight heuristic on the reply text.

Nice-to-have follow-up: also switch the Whisper STT language (or use auto-detect) so the
*next* utterance is transcribed with the right model settings.

Difficulty: medium-hard — the most interesting open problem in the repo right now. Come
discuss the approach in the issue before building.

---

## 5. Bilingual SMS commands

**Title:** SMS commands are French-only — add English keywords + replies

**Labels:** `good first issue`, `area: i18n`, `area: sms`

**Body:**

Besides voice, the assistant is drivable by SMS keywords (inspired by
[Sift](https://github.com/edleeman17/sift)): `METEO`, `AGENDA`, `RAPPEL 18h30 …`,
`FAIT`, `ROUTE`, `AIDE`. But `web/src/lib/sms-commands.ts` is FR-centric: the keywords,
the `HELP` text, and the replies are all French.

Goal: an English speaker can text `WEATHER`, `REMIND 18:30 buy milk`, `DONE`, `HELP` and
get English answers.

Suggestions:

- Accept **both** keyword sets regardless of profile language (they don't collide) — a
  keyword→command alias map keeps the parser flat.
- Pick the **reply** language from the profile's `preferred_language` (the
  `CallSession` passed into `handleSmsCommand` already carries `language`).
- The time parser handles `18h30`; make sure `18:30` works too (it already matches the
  regex — add a test/manual check).
- Localize the `HELP` text and the confirmation strings.

The skills themselves already answer via `CallSession.language`, so most of the work is
in the router file. Difficulty: easy-medium, self-contained in one file.

---

## 6. Dashboard toggle for preferred language

**Title:** Dashboard: let the user switch their preferred language (FR/EN)

**Labels:** `good first issue`, `area: web`

**Body:**

The `profiles.preferred_language` column exists (migration
`supabase/migrations/0002_language.sql`) and drives the whole call experience — STT,
voice, prompts, skill replies. But there's no UI to change it: today you'd edit the row
in Supabase by hand.

Goal: a small language setting (FR / EN) in the dashboard —
`web/src/app/tableau-de-bord/` — that reads and updates the profile column.

Notes:

- Follow the patterns already used by the dashboard for profile reads/writes (Supabase
  with RLS — the user can only touch their own row).
- A pair of radio buttons or a two-option select is plenty; no dropdown framework needed.
- Setting it during **onboarding** (`web/src/app/onboarding/`) would be a natural
  follow-up, so new users start in the right language.
- When a third language lands (see the "Add Spanish or German" issue), this control
  should pick up the new option — keep the options list in one place.

Difficulty: easy. Good first touch of the web app side.

---

## 7. Record the demo GIF / audio for the README

**Title:** Demo assets: call recording + GIF for the README

**Labels:** `good first issue`, `area: docs`, `blocked`

**Body:**

**Blocked on the live call-in number** (deployment + a Twilio number — maintainer's
accounts, see `open-source-launch-plan.md` Track 4). Filed now so someone can claim it
and be ready.

Once the number is live, the README needs proof it's real:

- A short **audio clip** (30–60 s) of a real call: greeting → "what's the weather in
  Lyon?" → answer → "remind me at 6 to call mom" → confirmation. One take, honest
  latency, no editing tricks — builders can hear the difference.
- A **GIF or short video** to embed at the top of `README.md` — e.g. a dumbphone in
  frame, captions transcribing the exchange (GitHub READMEs don't autoplay sound).
- Ideally one EN and one FR exchange, since bilingual is a headline feature — a single
  call that switches language mid-way would show off nicely.
- Add the assets under `.github/` or a `docs/media/` folder and embed them in the README
  "Status" section, replacing the "held until…" line with the number itself.

No coding required — a phone, a quiet room, and any screen/audio capture tool. Difficulty:
easy (once unblocked).
