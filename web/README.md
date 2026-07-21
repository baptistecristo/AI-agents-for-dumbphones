# `web/` — the brain

The Next.js app, and the only place business logic lives. It owns the skills, the prompts,
the call auth gate and the consent records, and serves them over an API to whichever voice
runtime is answering the phone ([Vapi](https://vapi.ai) today, `runtime/` one day). Adding
a skill here makes it work on both.

Start with the [root README](../README.md) for what the project is and what actually runs,
and [CONTRIBUTING.md](../CONTRIBUTING.md#add-a-skill) for the add-a-skill walkthrough.

## Run it

```bash
cp .env.example .env.local     # fill in the variables
npm install
npm run dev                    # http://localhost:3000
```

You need a Supabase project in an EU region — see the root README for the schema. Weather
and local time need no key; directions use a free OpenRouteService key.

```bash
npm test        # vitest (phone parsing, the skills gate)
npm run lint
npm run build
```

## Layout

| Path | What |
|---|---|
| `src/lib/skills/` | one file per skill, plus `index.ts` (the dispatcher) and `gate.ts` (which tools need the caller verified) |
| `src/lib/agents/` | system prompts, greetings, and the tool schemas each runtime is handed |
| `src/app/api/` | the runtime-facing API: `tools/execute`, `runtime/session`, the Vapi webhook, the crons |
| `src/app/` | the site itself: landing, sign-in, onboarding, dashboard |

Styling the site: [`docs/design-system.md`](docs/design-system.md) covers the tokens, the
type scale and the accessibility checklist.
