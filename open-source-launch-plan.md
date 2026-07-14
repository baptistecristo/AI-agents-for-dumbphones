# Open-source launch plan — recap & next steps

_Working session recap, 2026-07-13. This file supersedes the elderly-focused framing in `README.md` / `painpoints.md` / `prospects.csv` as the project's direction._

> **2026-07-14 build session:** Tracks 1, 2, 3 and 5 landed — persona pivoted (EN+FR),
> bilingual pipeline live in code (`preferred_language` column → per-language Whisper +
> Piper voices → localized skills), outbound missions de-medicalized, CONTRIBUTING
> updated and 7 good-first-issue drafts in `.github/GOOD_FIRST_ISSUES.md`. The remaining
> blocker is **Track 4 (live call-in number)** — it needs the maintainer's accounts
> (Vercel/Supabase/host/Twilio) and a little money.

---

## 1. The pivot

**Before:** phone-callable voice assistant for **elderly people** on dumbphones — an adult child sets it up, the senior calls for help; the agent even calls doctors/taxis/restaurants on their behalf.

**Now:** an open-source project to help **young people switch to a dumbphone and reconnect with life.**

> **The pitch:** You ditch the smartphone to escape the doomscroll — but you still occasionally need the *useful* stuff (directions, weather, a reminder, a quick fact). Instead of an app, you **call a number and ask an AI.** You keep the utility, you lose the addiction. Open-source, so the community builds the skills.

Why this works: the buyers and the contributors are the **same people** — the digital-minimalism / dumbphone crowd (r/dumbphones, Hacker News, r/nosurf) is tech-savvy and mission-driven. "Does anyone care?" and "will anyone contribute?" get answered in the same threads.

## 2. Decisions locked this session

| Question | Decision |
|---|---|
| Focus | **Open-source** — the goal is contributors + a project people care about, not revenue (for now) |
| Audience | Young people voluntarily switching to dumbphones |
| Language | **Bilingual EN/FR** — agent detects & responds in the caller's language |
| First demo asset | **Live call-in number** ("call this from any phone") |
| Who pays / who builds | Adult children were the old buyer; now the target is dumbphone users themselves + open-source contributors |

## 3. Where the code actually stands (the good news)

This is **not** a prototype — it's a complete, working phone-callable voice agent. Verified in the repo:

- **`runtime/`** — full self-hosted Pipecat pipeline: phone → Silero VAD → faster-whisper (STT) → LLM (Ollama local / Mistral EU / Anthropic) → Piper (TTS) → phone. Inbound webhook + outbound calling, Twilio & Telnyx wired. Business logic lives entirely in the web API (clean separation).
- **`web/`** — Next.js 16 API + skills, all implemented:
  - Skills: **weather** (Open-Meteo, free), **directions** (OpenRouteService, SMS steps), **agenda**, **reminders** (+ "did I already…?"), **contacts**, **memory**, **SMS**, **PIN**.
  - Runtime endpoints exist and are called: `/api/runtime/session`, `/api/tools/execute`, `/api/runtime/end`.
  - Auth, onboarding, dashboard, Supabase (EU) with encryption + consent registry + RLS.
- The call-in flow works **end-to-end in code**. Nothing fundamental is missing.

## 4. The two real gaps

**Gap A — the product is framed for the wrong audience.**
Prompts, `README.md`, `painpoints.md`, `prospects.csv`, and the doctor/taxi/resto outbound missions all target eldercare. The **core skills transfer perfectly** (weather, directions, reminders, calendar, SMS, memory = "the useful smartphone stuff, by voice"). What must change:
- New **persona / system prompt** — a companion for intentional living, not an eldercare assistant. (Currently: `web/src/lib/agents/inbound.ts`, French, "parle lentement", vouvoiement, eldercare tone.)
- **Trim / rebrand** the eldercare-specific outbound missions (keep a generic "call a place for me" if useful, e.g. book a restaurant).
- Rewrite **README / story** around the young-dumbphone mission.

**Gap B — a *live* number needs deployment + accounts + a little money.**
- Deploy web app (Vercel + Supabase) and the runtime (a host with Ollama/Whisper/Piper, or Mistral/Anthropic API to cut server load).
- Buy a Twilio number, point its Voice webhook at the runtime `/twilio/inbound`.
- Costs: host ~€10/mo, number ~€1/mo + a few cents/min. **Accounts and payment are the user's** — I do the config/wiring.

## 5. Bilingual EN/FR — what it takes

The code already routes language per-call, so this is additive:
- **STT:** currently hardcoded `Language.FR` in `runtime/bot.py`. Add EN — either faster-whisper auto-detect or pass language from the session.
- **TTS:** currently `fr_FR-siwis-medium` Piper voice only. Add an EN Piper voice and select per caller language.
- **Prompts:** `inboundSystemPrompt` and the greeting (`first_message`) need EN + FR versions; agent detects/responds in the caller's language.

## 6. The plan — tracks & sequence

### Track 1 — Story & persona pivot _(free, no accounts — can start now)_
- [x] Lock the bilingual one-liner / mission statement
- [x] Rewrite the agent persona + system prompt (EN + FR) for the young-dumbphone user
- [x] Rewrite `README.md` around the new mission (hero → demo → how it works → how to add a skill)

### Track 2 — Bilingual support _(code — mostly solo)_
- [x] EN + FR STT (whisper language handling)
- [x] Add an EN Piper voice + per-call voice selection
- [x] Bilingual prompts + greetings, language detection

### Track 3 — Trim skills for the pivot _(code — solo)_
- [x] Keep weather / directions / reminders / agenda / memory / SMS
- [x] Decide fate of the eldercare outbound missions (drop medical framing; keep generic booking?) → done: generic appointment preset replaces the doctor mission; taxi/resto/generic kept

### Track 4 — Live call-in number _(needs the user's accounts + money)_
- [ ] Deploy web app + Supabase (env, run migration `supabase/migrations/0001_init.sql`)
- [ ] Deploy runtime on a host (or run locally + ngrok for the first live test)
- [ ] Buy Twilio number, wire Voice webhook, share `RUNTIME_API_SECRET`, set URLs
- [ ] Make one real call end-to-end

### Track 5 — Repo contributor-readiness _(solo)_
- [x] `CONTRIBUTING.md`
- [x] 5–8 "good first issue" tickets — 7 drafts in `.github/GOOD_FIRST_ISSUES.md` (skills, third language, mid-call voice switch, bilingual SMS, dashboard toggle, demo assets)
- [ ] Demo GIF / audio + the call-in number in the README _(blocked on Track 4)_

### Track 6 — Launch _(with the user, later)_
- [ ] Show HN: _"Show HN: Call an AI from your dumbphone so you don't need a smartphone"_
- [ ] r/dumbphones, r/nosurf, r/digitalminimalism, r/selfhosted, r/LocalLLaMA, Pipecat Discord, Light Phone community

## 7. What I can do autonomously vs. what needs the user

| I can do now (free, no accounts) | Needs the user (accounts / money / their hands) |
|---|---|
| Story, one-liner, README rewrite | Twilio account + buying a phone number |
| Persona / system-prompt rewrite (EN+FR) | Paying for / choosing the host (Hetzner/Vercel/etc.) |
| Bilingual STT/TTS/prompt code | Supabase project creation |
| Skill trimming | Google OAuth client (if keeping agenda/contacts) |
| CONTRIBUTING.md + good-first-issues | Running deploy/login commands, the first live call |

## 8. Recommended next step

Start **Track 1** (story + persona + README) immediately — it's free, needs no accounts, and everything downstream (launch posts, demo script, which skills to keep, bilingual prompts) depends on the mission being locked. Do **Track 5** (repo prep) in parallel. Hold Track 4 (the live number) until the story is locked and we do it together (accounts + payment).
