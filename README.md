# Call an AI from your dumbphone

**Ditch the smartphone without losing the useful stuff.** Instead of an app, you
**call a number and ask** — weather, directions, a reminder, your calendar, a quick
text to someone. You keep the utility, you lose the doomscroll.

Open-source and **self-hostable end-to-end**: a phone number wired to a
Pipecat pipeline (Silero VAD → faster-whisper → a local/EU LLM → Piper TTS), with all
the skills living behind one clean API. No app store, no account on the phone — the
handset stays a dumb terminal, the intelligence is on a server you control.

> **Bilingue EN/FR** — appelez un numéro depuis un téléphone à clapet et demandez ce
> dont vous avez besoin (météo, itinéraire, rappel). Vous gardez l'utile, vous perdez
> l'addiction. Auto-hébergeable, open-source, et la communauté ajoute les compétences.

**Know [Sift](https://github.com/edleeman17/sift)?** Sift is a beloved dumbphone
companion you *text* — `WEATHER`, `REMIND 18:30 …` — and it texts back. This project is
that idea taken to **voice** (you *call* and just talk, no keywords to memorize) and made
**self-hostable end-to-end**. We kept Sift's SMS-command model as a lighter, cheaper
fallback (`web/src/lib/sms-commands.ts`) and put a full voice pipeline in front of it.

---

## Status — early, working in code, seeking founding co-builders

This is **not** a toy prototype. The full call-in flow works **end-to-end in code**:
self-hosted voice pipeline, inbound + outbound calling, skills, auth, an EU database
with encryption and a consent registry. What's *not* done yet is exactly where the fun
open problems are — and where you come in:

- 🎙️ **Bilingual EN/FR works.** Each caller has a preferred language
  (`profiles.preferred_language`); the session hands it to the runtime, which picks the
  Whisper language and a per-language Piper voice (`PIPER_VOICE_FR` / `PIPER_VOICE_EN`),
  and skills answer in the caller's language. The agent even switches language mid-call
  if you do — though Piper voices are monolingual, so the *voice* stays the session's
  until someone builds mid-call voice switching (a great issue, see below).
- 🧩 **Skills are a plugin surface.** Adding a **new skill** (a thing the agent can do on
  a call) is a small, self-contained PR. This is one of the two best on-ramps; a **third
  language** is the other.
- 📞 **A live public call-in number** needs deployment + a phone number (a little money,
  the maintainer's accounts) — held until the repo is contributor-ready.

If you build voice AI, self-host things, or just want people to be able to leave the
smartphone without going off-grid — **we'd love a few founding co-builders.** See
[CONTRIBUTING.md](CONTRIBUTING.md) and the good-first-issues.

---

## How it works

```
Dumbphone ──call──▶ Phone number (Twilio / Telnyx trunk)
                          │  media over WebSocket
                          ▼
        Self-hosted runtime (runtime/, Pipecat)
        Silero VAD → faster-whisper (STT) → LLM → Piper (TTS)
                          │  every tool-call is forwarded, never executed here
                          ▼
        Next.js API (web/)  ──▶  skills  ──▶  Open-Meteo · OpenRouteService
        /api/tools/execute                     Google Calendar/Contacts · Twilio SMS
                          │
                          ▼
        Supabase Postgres (EU) — encrypted tokens, consent registry, RLS
```

**One brain, swappable body.** All business logic — skills, prompts, PINs, consent —
lives in `web/src/lib/` and is served over an API. The voice runtime is interchangeable:
[Pipecat](https://github.com/pipecat-ai/pipecat) self-hosted (`runtime/`, the default) or
[Vapi](https://vapi.ai) managed (`RUNTIME=vapi`) if you want the lowest latency without
running infra. [LiveKit Agents](https://github.com/livekit/agents) is another self-host
option. Adding a skill once makes it work on either runtime.

## What's implemented

| Layer | Choice | Where |
|---|---|---|
| Voice runtime | **Self-hosted** Pipecat + faster-whisper + Piper + Ollama/Mistral/Anthropic. Vapi available as a managed fallback (`RUNTIME=vapi`) | `runtime/` + `web/src/lib/vapi.ts` |
| Telephony | **Twilio** (or Telnyx) trunk — a phone number is the one thing you can't self-host | `runtime/server.py` |
| SMS + OTP | **Twilio** (Messages + Verify) | `web/src/lib/twilio.ts` |
| Inbound agent | Bilingual (EN/FR) system prompt + greeting, switches language mid-call, spoken-PIN gate before sensitive actions, two-step voice confirmation | `web/src/lib/agents/inbound.ts` |
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
2. **Add a *third* language (ES / DE / …) or mid-call voice switching** — EN and FR ship
   already; a new language is the same four touch points, additive. Or make the TTS voice
   follow the caller when they change language mid-call. Walkthrough in
   [CONTRIBUTING.md](CONTRIBUTING.md#add-a-language-or-voice).

Both ship to a real call-in number once the live demo is up. Tight feedback loop.

## Run it locally

You can run everything without buying a phone number (test the pipeline over a local
WebSocket / with ngrok). Full setup, accounts, and the "day the number arrives" checklist
are in the sections below and in [`runtime/README.md`](runtime/README.md).

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

Database: run the files in `supabase/migrations/` (in order) in your Supabase SQL editor
(choose an **EU region**). Weather (Open-Meteo) needs no key; directions use a free OpenRouteService
key. The default LLM is fully local via Ollama — set `LLM_PROVIDER=mistral|anthropic` for
higher quality at a few cents per call.

## Design principles

- **Own your stack.** Default path is 100% self-hosted and local (Whisper + Piper +
  Ollama). Managed providers are opt-in, never required.
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
