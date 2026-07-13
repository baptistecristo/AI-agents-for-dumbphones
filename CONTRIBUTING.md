# Contributing

Thanks for wanting to build this. The goal is simple: let people leave the smartphone
without losing the useful stuff, by calling a number instead of opening an app — and let
the community add the skills and languages that make that real.

This project is **early and looking for founding co-builders.** The two best first
contributions are **adding a skill** and **adding a language/voice** — both are small,
self-contained, and ship to a live call-in number. Walkthroughs below.

- Be a builder talking to builders. No hype, no growth-speak.
- Small PRs welcome. "This is wrong because X" is a welcome PR too.
- Questions / "I want to help, where do I start?" → open a
  [Discussion](../../discussions) or comment on a good-first-issue.

## Architecture in one paragraph

The **voice runtime** (`runtime/`, Pipecat) turns a phone call into text, runs an LLM, and
speaks the reply — but it **executes nothing itself**. Every tool-call is forwarded to the
**Next.js API** (`web/`), which owns all business logic: skills, prompts, PINs, consent.
That separation is the whole design: **one implementation of each skill serves both
runtimes** (self-hosted Pipecat *and* managed Vapi). So when you add a skill, you write the
logic once and declare its schema in two small mirror files.

## Local setup

```bash
# 1. Web API + skills
cd web && cp .env.example .env.local && npm install && npm run dev   # :3000

# 2. Voice runtime (separate terminal)
cd runtime && pip install -r requirements.txt && cp .env.example .env
uvicorn server:app --port 8000
```

- Database: run `supabase/migrations/0001_init.sql` in a Supabase project (**EU region**).
- Weather (Open-Meteo) needs no key. Directions need a free OpenRouteService key.
- LLM defaults to **fully local via Ollama** (`LLM_PROVIDER=ollama`). Set
  `mistral` or `anthropic` for higher quality.
- You can test the pipeline over a local WebSocket / ngrok **without buying a phone
  number.** See [`runtime/README.md`](runtime/README.md).

---

## Add a skill

A *skill* is one thing the agent can do on a call (look something up, set something,
send something). Adding one is **four small edits**. Say you want a `define` skill —
"what does *ephemeral* mean?":

**1. Write the logic** — `web/src/lib/skills/define.ts`. A skill is an async function that
takes the call `session` + the model's `args` and returns a **short string the agent will
read aloud**. Return data, not instructions.

```ts
import { CallSession, SkillResult } from "./types";

export async function define(
  _session: CallSession,
  args: { word?: string },
): Promise<SkillResult> {
  if (!args.word) return "Which word should I define?";
  const res = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(args.word)}`,
  );
  if (!res.ok) return `I couldn't find a definition for "${args.word}".`;
  const data = (await res.json()) as { meanings?: { definitions?: { definition?: string }[] }[] }[];
  const first = data[0]?.meanings?.[0]?.definitions?.[0]?.definition;
  return first ? `${args.word}: ${first}` : `No definition found for "${args.word}".`;
}
```

**2. Register it in the dispatcher** — `web/src/lib/skills/index.ts`. Add a `case` to the
`executeTool` switch:

```ts
import { define } from "./define";
// ...
case "define":
  return await define(session, args);
```

**3. Declare the schema for the self-hosted runtime** — `runtime/tools.py`, inside
`inbound_tools()` (Pipecat `FunctionSchema`):

```python
_schema(
    "define",
    "Give the dictionary definition of an English word.",
    {"word": {"type": "string", "description": "The word to define"}},
    ["word"],
),
```

**4. Declare the same schema for the managed (Vapi) runtime** — `web/src/lib/agents/tools.ts`,
inside `agentTools()`:

```ts
serverTool(
  "define",
  "Give the dictionary definition of an English word.",
  { word: { type: "string", description: "The word to define" } },
  ["word"],
),
```

That's it — execution is delegated to `/api/tools/execute`, so both runtimes now have the
skill. Keep the tool name identical across all four spots. Sensitive actions (sending an
SMS, placing a call) require a verified spoken PIN — see `send_sms` / `place_call` for the
`confirmed`-then-act pattern if your skill does something irreversible.

> **Good first skills:** unit / currency conversion, current time in a city, a transit
> departure lookup, "read me the top headline," a countdown timer. Prefer free, keyless
> APIs where possible (like Open-Meteo).

---

## Add a language or voice

The code already routes language per call; today it only ships **French**. Making it
answer in the **caller's** language is additive and one of the highest-value contributions.
Four touch points:

**1. STT** — `runtime/bot.py` pins `language=Language.FR` on the `WhisperSTTService`. Make
it come from the session, or use faster-whisper auto-detect, so English (or any) speech is
transcribed correctly.

**2. TTS voice** — `runtime/config.py` sets `PIPER_VOICE = "fr_FR-siwis-medium"`. Add an
English [Piper voice](https://github.com/rhasspy/piper) (e.g. `en_US-...`, they
auto-download on first use) and select the voice per caller language where
`PiperTTSService(voice_id=...)` is built in `bot.py`.

**3. Prompts + greeting** — `web/src/lib/agents/inbound.ts` holds the system prompt and the
first-message greeting, currently French-only. Add an English version and pick per
detected/selected language.

**4. Skill output (follow-up)** — skills currently return French strings (e.g. the WMO
weather descriptions in `skills/weather.ts`, and `frDate` in `skills/types.ts` uses
`fr-FR`). Fully localized replies mean returning strings in the caller's language too — a
great second PR after the pipeline speaks the language.

Adding a **non-EN/FR** language (Spanish, German, Arabic…) follows the exact same four
steps — pick the Whisper language + a Piper voice + translated prompts.

---

## Pull requests

- One skill / one language per PR keeps review fast.
- Match the surrounding code style (the repo has ESLint on the web side, ruff on the
  runtime side).
- Note in the PR whether you tested against the self-hosted runtime, Vapi, or just the
  API. A manual "I called it and it said X" is the gold standard.
- New to the tool interface? The comments in `runtime/tools.py` and
  `web/src/lib/skills/index.ts` explain the data-not-instructions rule (external content is
  always returned to the model as data).

By contributing you agree your contributions are licensed under the project's
[Apache-2.0](LICENSE) license.
