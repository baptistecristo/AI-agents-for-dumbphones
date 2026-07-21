# Design pointers from OpenClaw

[OpenClaw](https://github.com/openclaw/openclaw) (MIT) is a self-hosted gateway that connects
chat apps (Signal, Telegram, WhatsApp, Discord…) to an LLM agent: bring your own model, add
capabilities as plugins. This project reached a similar shape from the other direction (voice
over the phone rather than chat apps), so OpenClaw is useful less as code to lift and more as a
second data point on what this kind of system needs, and on how it fails as it grows.

**Caveat first:** OpenClaw has no telephony. Every channel it speaks needs a smartphone running
an app, which is the one thing a dumbphone caller doesn't have. It is not a runtime option here;
the self-hosted path stays Pipecat plus a Twilio/Telnyx trunk
([Discussion #9](https://github.com/baptistecristo/AI-agents-for-dumbphones/discussions/9)).

## Where it confirms the current design

Already how the repo works. OpenClaw is independent evidence these were the right calls.

- **One brain, swappable body.** All logic lives in the gateway; the front-end is
  interchangeable. Here that's the skills API behind `RUNTIME=vapi` or `runtime/`.
- **Skills as a plugin surface.** A new capability is a small, self-contained unit in both
  projects (`web/src/lib/skills/`).
- **Per-sender isolation.** OpenClaw runs an isolated session per sender; here that's per-caller
  identity and rate limits (`web/src/lib/rate-limit.ts`).
- **Local-first data.** Config and history stay on your own machine, in line with the EU /
  privacy-first stance.

## Worth adopting (not here yet)

- **Harden the skill surface before it grows.** Any project that invites third-party skills is
  building an attack surface: a skill runs with the agent's own reach, so prompt injection and
  data exfiltration are the shapes to plan for. "Add a skill"
  ([CONTRIBUTING.md](../CONTRIBUTING.md)) is this project's growth path too, so the same
  guardrails apply: keep treating skill output as data (already a design principle), scope each
  skill to only the APIs it needs, and review community skills before they can reach stored
  tokens.
- **Keep consequential actions gated.** An agent that acts on someone's behalf without a
  visible consent step leaves them to discover what it did afterwards. The outbound engine here
  (`web/src/lib/agents/outbound.ts`) can call places and work through menus, so anything that
  sends or commits should keep its one-time code and two-step voice confirmation rather than
  acting on inference alone.
- **A local control view.** OpenClaw ships a browser dashboard for live sessions and config. A
  small local view of active calls, per-caller sessions, and per-minute cost would fit `web/`
  and make the cost problem visible while you bring the self-hosted runtime up.

## Not applicable

- **Telephony.** OpenClaw has none, and the phone leg is this project's whole reason to exist.
- **Its chat channels** (Discord, WhatsApp, Signal…) all need a smartphone; the caller is on a
  dumbphone. A messaging channel would only fit a separate smartphone-side companion, never the
  core line.
