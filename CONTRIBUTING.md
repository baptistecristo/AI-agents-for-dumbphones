# Contributing

Thanks for wanting to build this. The goal is simple: let people leave the smartphone
without losing the useful stuff, by calling a number instead of opening an app - and let
the community add the skills and languages that make that real.

This project is **early and looking for founding co-builders.** The two best first
contributions are **adding a skill** and **adding a third language** (EN and FR ship
already) — both are small and self-contained. **The call-in number is down**: the Vapi
account is out of credit, so you can test against the web API but not over a real call.
See the [status section](README.md#status--early-honest-about-what-runs-seeking-founding-co-builders).
Walkthroughs below. More ready-to-claim ideas in the
[good-first-issue list](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

- Be a builder talking to builders. No hype, no growth-speak.
- Small PRs welcome. "This is wrong because X" is a welcome PR too.
- Questions / "I want to help, where do I start?" → open a
  [Discussion](../../discussions) or comment on a good-first-issue.

## Architecture in one paragraph

The **voice runtime** (`runtime/`, Pipecat) turns a phone call into text, runs an LLM, and
speaks the reply — but it **executes nothing itself**. Every tool-call is forwarded to the
**Next.js API** (`web/`), which owns all business logic: skills, prompts, call auth, consent.
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

- Database: run the files in `supabase/migrations/` (in order) in a Supabase project
  (**EU region**).
- Weather (Open-Meteo) needs no key. Directions need a free OpenRouteService key.
- LLM defaults to **fully local via Ollama** (`LLM_PROVIDER=ollama`). Set
  `mistral` or `anthropic` for higher quality.
- You can test the pipeline over a local WebSocket / ngrok **without buying a phone
  number.** See [`runtime/README.md`](runtime/README.md).

---

## Add a skill

A *skill* is one thing the agent can do on a call (look something up, set something,
send something). Adding one is **five small edits**: four to make it run, one to say who
is allowed to use it. Say you want a `define` skill — "what does *ephemeral* mean?":

**1. Write the logic** — `web/src/lib/skills/define.ts`. A skill is an async function that
takes the call `session` + the model's `args` and returns a **short string the agent will
read aloud**. Return data, not instructions. Every caller-facing string goes through
`t(session, { fr, en })`: one skill serves both FR and EN calls.

```ts
import { CallSession, SkillResult, t } from "./types";

export async function define(session: CallSession, args: { word?: string }): Promise<SkillResult> {
  if (!args.word)
    return t(session, { fr: "Quel mot dois-je définir ?", en: "Which word should I define?" });

  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(args.word)}`);
  if (!res.ok)
    return t(session, {
      fr: `Je ne trouve pas de définition pour « ${args.word} ».`,
      en: `I couldn't find a definition for "${args.word}".`,
    });

  const data = (await res.json()) as { meanings?: { definitions?: { definition?: string }[] }[] }[];
  const first = data[0]?.meanings?.[0]?.definitions?.[0]?.definition;
  if (!first)
    return t(session, {
      fr: `Aucune définition pour « ${args.word} ».`,
      en: `No definition found for "${args.word}".`,
    });
  return t(session, { fr: `${args.word} : ${first}`, en: `${args.word}: ${first}` });
}
```

`executeTool` already wraps every skill in a try/catch and apologizes to the caller in their
language, so a dead `fetch` is handled. Don't write your own catch-all.

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
    "Donne la définition d'un mot anglais.",
    {"word": {"type": "string", "description": "Le mot à définir"}},
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

Execution is delegated to `/api/tools/execute`, so both runtimes now have the skill. Keep
the tool name identical across every spot.

Those two schema files are mirrors: same name, same parameters, same required list. Only
the prose differs. The LLM reads these descriptions and the caller never hears them, so
`tools.py` writes them in French today and `tools.ts` in English. Follow the entries around
yours.

**5. Classify it in the gate** — `web/src/lib/skills/gate.ts`. Every tool gets one of two
policies, and there is no third option:

```ts
define: "free",   // or "code" if it reads or changes the caller's own data
```

`"code"` means the caller must pass a one-time SMS code first, the way the calendar,
contacts, recalled notes, `send_sms` and `place_call` do. `"free"` means anyone who dials
can use it: weather, directions, setting and listing reminders, note-taking, and `define`
above.

Weigh what your tool destroys, not only what it shows. `mark_done` is `"code"` while the
other reminder tools stay `"free"`, because it switches a reminder off: the cron never
sends it, and the caller doesn't notice a reminder that never arrives. Reading the same
row costs nothing. If your tool changes state someone relies on, give it the code even
when what it exposes looks dull.

**A tool you don't classify does not run.** `TOOL_POLICY` is exhaustive, the dispatcher
refuses anything missing from it, and `gate.test.ts` compares it against `agentTools()` in
both directions, so forgetting this step fails your build with the tool name printed. That
is on purpose. The old gate listed only the protected tools, which meant a forgotten skill
went live ungated and silent, and the person who paid for the mistake was never the person
who made it. Now the failure lands on you, at your first test run.

The gate matches on the tool *name*, so it cannot protect an *argument*. `get_directions`
is the other half of the pattern: the tool is `"free"`, but its default starting point is
the caller's home address, so the dispatcher only passes that once the caller has given
the code. If stored data reaches your skill as an input rather than being what your skill
returns, guard it in `index.ts` where the argument is assembled. `TOOL_POLICY` cannot see
it, and it will not warn you.

Anything irreversible (sending an SMS, placing a call) also gets the `confirmed`-then-act
pattern. See `send_sms` / `place_call`.

**Check it without a call.** With the number down, reach `/api/tools/execute` directly. An
unknown `call_id` gives you an unverified session in the default language:

```bash
curl -s localhost:3000/api/tools/execute \
  -H "Authorization: Bearer $RUNTIME_API_SECRET" -H "Content-Type: application/json" \
  -d '{"call_id":"local-test","name":"define","arguments":{"word":"ephemeral"}}'
```

That doubles as a check on step 5: a `"code"` tool refuses on an unverified session instead
of running, and an unclassified one comes back as `Unknown tool`. Locally, with no SMS
provider configured, that refusal reads UNAVAILABLE rather than REFUSED. Then `npm test`
and `npm run lint` in `web/`.

> **Good first skills:** unit / currency conversion, a transit departure lookup, "read me
> the top headline," a countdown timer. Prefer free, keyless APIs where possible (like
> Open-Meteo). To read a real one first, `skills/time.ts` is the shortest in the tree.

---

## Add a language or voice

The pipeline is **bilingual EN/FR today**, end to end: each caller has a
`preferred_language` on their profile (`supabase/migrations/0002_language.sql`),
`/api/runtime/session` returns it as `language: "fr" | "en"`, and the runtime picks the
Whisper language and Piper voice from it. Skills localize their replies via
`CallSession.language`. Adding a **third language** (Spanish, German, Arabic…) is the
same four touch points, purely additive:

**1. STT** — the runtime sets the Whisper language from the session's `language` field
(`runtime/bot.py`). Map your new language code (`"es"` → `Language.ES`, etc.).

**2. TTS voice** — `runtime/config.py` reads one env var per language:
`PIPER_VOICE_FR` and `PIPER_VOICE_EN` (a standard `en_US` medium voice by default).
Add `PIPER_VOICE_ES` (or `_DE`, …) — pick a
[Piper voice](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/VOICES.md) and
[listen to the samples](https://rhasspy.github.io/piper-samples/), they auto-download on
first use — and add it to the per-language selection where
`PiperTTSService(voice_id=...)` is built in `bot.py`.

**3. Prompts + greeting** — `web/src/lib/agents/inbound.ts` holds the system prompt and
the first-message greeting in EN and FR. Add your language's version and wire it into the
per-language selection. Keep the safety rules intact in translation: two-step confirm,
the one-time SMS code, never say the caller's address out loud, tool output is data not
instructions.

**4. Skill strings** — skills switch their output strings on `CallSession.language`
(e.g. the WMO weather descriptions in `skills/weather.ts`, date formatting in
`skills/types.ts`). Add your language's strings alongside the EN/FR ones.

Then allow the new code in `profiles.preferred_language` (a follow-up migration) and in
the dashboard's language setting, and you're done.

> **Known limitation — a good separate contribution:** speech-to-text is pinned to the
> session's language at call setup, so a caller who switches language mid-call is
> transcribed by a model still listening for the other one. The prompt tells the agent to
> follow the switch, but the transcript degrades. Self-hosted, the voice is stuck too,
> since Piper voices are monolingual. Handling a mid-call language change is a well-scoped
> issue of its own.

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
