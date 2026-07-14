# Call an AI from your dumbphone

[![CI](https://github.com/baptistecristo/AI-agents-for-dumbphones/actions/workflows/ci.yml/badge.svg)](https://github.com/baptistecristo/AI-agents-for-dumbphones/actions/workflows/ci.yml)

**Ditch the smartphone without losing the useful stuff.** Instead of an app, you
**call a number and ask** — weather, directions, a reminder, your calendar, a quick
text to someone. You keep the utility, you lose the doomscroll.

Open-source: a phone number wired to a voice pipeline, with all the skills living
behind one clean API. No app store, no account on the phone — the handset stays a dumb
terminal, the intelligence is on a server. Today that server is [Vapi](https://vapi.ai),
a managed platform — rented, per-minute, and currently out of credit, which is why the
demo number is silent. **Getting off it — onto the self-hosted Pipecat pipeline in
`runtime/` — is the project's number one open problem**, and it's
[Discussion #9](https://github.com/baptistecristo/AI-agents-for-dumbphones/discussions/9).

> **Bilingue EN/FR** — appelez un numéro depuis un téléphone à clapet et demandez ce
> dont vous avez besoin (météo, itinéraire, rappel). Vous gardez l'utile, vous perdez
> l'addiction. Open-source, et la communauté ajoute les compétences.

**Know [Sift](https://github.com/edleeman17/sift)?** Sift is a beloved dumbphone
companion you *text* — `WEATHER`, `REMIND 18:30 …` — and it texts back. This project is
that idea taken to **voice** — you *call* and just talk, no keywords to memorize. We kept
Sift's SMS-command model in the codebase as a lighter fallback
(`web/src/lib/sms-commands.ts`) and put a voice pipeline in front of it.

---

## Status — early, honest about what runs, seeking founding co-builders

**What works:** the agent has answered a real phone call and done the skills below,
bilingual EN/FR — that happened, on a rented number. Inbound + outbound calling, auth,
an EU database with encryption and a consent registry are built and deployed. CI builds
the web app and imports the runtime on every push.

**What's dead right now:** the demo number. It answered — then the maintainer ran out
of **Vapi** credits. At the measured ~$0.14/minute, one person cannot keep a public
demo breathing out of pocket. That is not a footnote, it's the whole argument: **the
project's own demo is dead because of the exact dependency the project wants to remove.**

**What has never worked:** the self-hosted Pipecat runtime in `runtime/` is
**scaffolding that has never placed a call** — a starting point, not a pipeline. And
**no Twilio account is connected**, so anything that delivers by SMS (directions,
dictated texts, the SMS command router) can't send.

Those gaps *are* the invitation. The fun open problems:

- 🎙️ **Bilingual EN/FR works.** Each caller has a preferred language
  (`profiles.preferred_language`); the session hands it to the runtime, which picks the
  Whisper language and a per-language Piper voice (`PIPER_VOICE_FR` / `PIPER_VOICE_EN`),
  and skills answer in the caller's language. The agent even switches language mid-call
  if you do — though Piper voices are monolingual, so the *voice* stays the session's
  until someone builds mid-call voice switching (a great issue, see below).
- 🧩 **Skills are a plugin surface.** Adding a **new skill** (a thing the agent can do on
  a call) is a small, self-contained PR. This is one of the two best on-ramps; a **third
  language** is the other.
- 🔌 **Getting off Vapi** — the biggest one, and now the loudest. `runtime/` has the
  shape of a Pipecat pipeline (Silero VAD → faster-whisper → local LLM → Piper) but has
  never carried a real call. Make it carry one and the demo stops being rented. If you
  self-host voice, this is the problem:
  [Discussion #9](https://github.com/baptistecristo/AI-agents-for-dumbphones/discussions/9).
- 📞 **The number is capped and rate-limited now** — 180s per call, 5 calls per caller
  per hour, 60 a day across everyone. That was the last thing standing between it and
  this README. Now it's the credits.

If you build voice AI, self-host things, or just want people to be able to leave the
smartphone without going off-grid — **we'd love a few founding co-builders.** See
[CONTRIBUTING.md](CONTRIBUTING.md) and the good-first-issues.

---

## How it works

```
Dumbphone ──call──▶ Phone number
                          │  media
                          ▼
        Voice runtime  ──  TODAY: Vapi (managed, RUNTIME=vapi)
                       └─  GOAL: runtime/ (Pipecat, self-hosted, not working yet)
                           Silero VAD → faster-whisper → LLM → Piper
                          │  every tool-call is forwarded, never executed here
                          ▼
        Next.js API (web/)  ──▶  skills  ──▶  Open-Meteo · OpenRouteService
        /api/tools/execute                     Google Calendar/Contacts · Twilio SMS
                          │
                          ▼
        Supabase Postgres (EU) — encrypted tokens, consent registry, RLS
```

**One brain, swappable body.** All business logic — skills, prompts, PINs, consent —
lives in `web/src/lib/` and is served over an API. The voice runtime is meant to be
interchangeable: [Vapi](https://vapi.ai) managed (`RUNTIME=vapi`) is what runs today;
[Pipecat](https://github.com/pipecat-ai/pipecat) self-hosted (`runtime/`) is the
scaffolded alternative that needs finishing;
[LiveKit Agents](https://github.com/livekit/agents) would be another. Adding a skill
once makes it work on either runtime — that part is real, and it's why the diagram above
is drawn the way it is.

## What's implemented

| Layer | Choice | Where |
|---|---|---|
| Voice runtime | **Vapi** (`RUNTIME=vapi`) — the only one that has ever carried a call, and it's out of credit. Self-hosted Pipecat + faster-whisper + Piper + Ollama is scaffolded but has never placed one ([#9](https://github.com/baptistecristo/AI-agents-for-dumbphones/discussions/9)) | `web/src/lib/vapi.ts` + `runtime/` |
| Telephony | Vapi's number today. A **Twilio**/Telnyx trunk is what the self-hosted path needs — a phone number is the one thing you can't self-host | `runtime/server.py` |
| SMS + OTP | **Twilio** (Messages + Verify) — coded, but **no Twilio account is connected**, so nothing actually sends yet | `web/src/lib/twilio.ts` |
| Inbound agent | Bilingual (EN/FR) system prompt + greeting, switches language mid-call, spoken-PIN gate before sensitive actions, two-step voice confirmation | `web/src/lib/agents/inbound.ts` |
| Public-number guard | 180s per call, plus rate limiting: 5 calls per caller per hour, 20/day, 60/day across everyone. Over the limit, Vapi speaks a refusal and hangs up | `web/src/lib/rate-limit.ts` |
| Outbound calling | Generalized engine — the agent can **call a place for you** (booking, appointment), handle DTMF menus and voicemail, retry, then text you the result | `web/src/lib/agents/outbound.ts` |
| Skills | calendar, reminders (+ "did I already…?"), weather (Open-Meteo, free), directions-by-SMS (OpenRouteService), contacts, dictated SMS, memory, PIN | `web/src/lib/skills/` |
| SMS commands | `WEATHER`, `AGENDA`, `REMIND 18:30 …`, `DONE`, `ROUTE`, `HELP`, `STOP/START` — inspired by [Sift](https://github.com/edleeman17/sift) | `web/src/lib/sms-commands.ts` |
| Data (EU) | Supabase Postgres: profiles (incl. `preferred_language`), phones, OAuth tokens **encrypted AES-256-GCM**, append-only consent registry, reminders, memory, call/SMS logs — RLS everywhere | `supabase/migrations/` |
| Web app | Next.js: landing, magic-link sign-in, onboarding (phone OTP → Google OAuth → consent → PIN), dashboard | `web/src/app/` |

> **History:** the project began life aimed at *elderly* dumbphone users; the persona,
> prompts, and outbound missions are now fully pivoted to the young-dumbphone mission —
> see [`open-source-launch-plan.md`](open-source-launch-plan.md) for the story.

## Two ways to help in an afternoon

1. **Add a skill** — a new thing the agent can do on a call (a fact lookup, a timer, a
   transit query…). It's one small TypeScript function plus a tool schema. Walkthrough in
   [CONTRIBUTING.md](CONTRIBUTING.md#add-a-skill).
2. **Add a *third* language (ES / DE / …)** — EN and FR ship already; a new language is
   the same four touch points, additive. Walkthrough in
   [CONTRIBUTING.md](CONTRIBUTING.md#add-a-language-or-voice).

Honest caveat: you can test both against the web API, but not against a live call —
calls run on the maintainer's rented Vapi account, which is out of credit. One more
reason the self-hosted runtime matters: it's the version you could run yourself.

## Run it locally

The web API and skills run without buying a phone number, and that's where the
contributor on-ramps live. The voice runtime starts but has never carried a call — see
the status section before you count on it. Full setup, accounts, and the "day the number
arrives" checklist are in the sections below and in
[`runtime/README.md`](runtime/README.md).

```bash
# Web API + skills
cd web
cp .env.example .env.local     # fill in the variables
npm install
npm run dev                    # http://localhost:3000

# Voice runtime (separate terminal) — see runtime/README.md
cd runtime
pip install -r requirements.txt
cp .env.example .env           # NEXT_API_URL, RUNTIME_API_SECRET, provider keys
uvicorn server:app --port 8000
```

Database: create your own Supabase project in an **EU region**, then apply the schema with
`supabase link --project-ref <your-ref>` and `supabase db push` (or paste the files in
`supabase/migrations/` in order into the SQL editor). Weather (Open-Meteo) needs no key;
directions use a free OpenRouteService key. The default LLM is fully local via Ollama — set
`LLM_PROVIDER=mistral|anthropic` for higher quality at a few cents per call.

## Design principles

- **Own your stack.** The goal is a path that is 100% self-hosted and local (Whisper +
  Piper + Ollama), with managed providers opt-in and never required. We are not there:
  the only working runtime today is a managed one. See
  [#9](https://github.com/baptistecristo/AI-agents-for-dumbphones/discussions/9).
- **EU / privacy-first.** Data in an EU Postgres, OAuth tokens encrypted at rest, an
  append-only revocable consent registry, RLS everywhere.
- **The phone stays dumb.** No app, no account on the handset. Caller-ID identifies you; a
  **spoken PIN** gates sensitive actions (caller-ID can be spoofed); sensitive actions get a
  two-step voice confirmation.
- **External content is data, never instructions.** Tool outputs are returned to the model
  as data, never merged into the instruction channel.

## Built on / inspired by

- **[Sift](https://github.com/edleeman17/sift)** (MIT) — a dumbphone companion; its
  two-way SMS command model inspired `sms-commands.ts`.
- **[Pipecat](https://github.com/pipecat-ai/pipecat)** / **[LiveKit Agents](https://github.com/livekit/agents)** — the self-hosted voice runtime.
- **Open-Meteo** (free weather), **OpenRouteService** (EU directions).

## License

[Apache-2.0](LICENSE). Copyright 2026 the AI-agents-for-dumbphones contributors.
