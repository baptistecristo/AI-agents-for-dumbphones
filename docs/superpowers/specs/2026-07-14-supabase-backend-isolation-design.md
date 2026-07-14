# Isolated Supabase backend for the dumbphone agent

**Date:** 2026-07-14
**Status:** Approved, pending implementation plan

## Problem

The live call-in demo (Track 4 of `open-source-launch-plan.md`) is the last blocker
to launch, and it needs a real Supabase project. This repo has migrations
(`supabase/migrations/0001_init.sql`, `0002_language.sql`) but no project to apply
them to, and `web/.env.example` still carries placeholder keys.

The maintainer also runs a second, unrelated product (Alain) whose own Supabase
project — `baptiste@alain-app.care's Project`, ref `hsjslkndzuchlysloxcx`,
`eu-central-1`, created 2026-06-06 — is **in active use and off-limits**. The
Supabase CLI is logged in to that account and is one `supabase link` away from it.
The realistic failure mode is applying this project's ten-table migration onto
Alain's database.

Firebase is not part of this project and will not be introduced. It belongs to the
Alain landing page only. This project's architecture (`voice-agent-architecture.md`
§5) specifies Next.js + Supabase (Auth + Postgres, EU region) + Vercel; Firebase
would duplicate the database, auth, and hosting layers that already exist.

## Goals

- One new Supabase project for the dumbphone agent, in an EU region, with the
  existing migrations applied.
- Structural separation from Alain, such that an accidental cross-link is not
  merely discouraged but unlikely to arise.
- Alain's project provably untouched.

## Non-goals

- Vercel deployment, runtime hosting, and the Twilio number. These are the other
  three parts of Track 4 and each gets its own spec.
- Migrating or altering anything in Alain's project beyond a rename.
- Introducing Firebase.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Backend | Supabase only | Architecture §5; migrations, RLS and env vars already written for it |
| Location | New org, same login | Own billing and member list; transferable to the community later |
| Org name | `AI agents for dumbphones` | Mirrors the GitHub repo |
| Project name | `ai-agents-for-dumbphones` | Same |
| Region | `eu-central-1` | EU data residency (phone numbers, call logs, OAuth tokens) |
| Alain's project | Rename to `alain-landing` | Its default name says nothing; metadata-only change |

A new org is used rather than a second project in the existing org because this
project is open-source and may later gain contributors with database access. They
should not be invited into an org that also contains Alain.

## Isolation mechanism

There is **no config-file pin** for the remote project. This was verified rather
than assumed:

- Root `project_id` in `supabase/config.toml` is a *local* identifier — it defaults
  to the working directory name and distinguishes projects on the same host. It does
  not bind the repo to a remote project.
- The `[remotes.<branch>]` block does hold a real project ref, but it configures
  persistent branches, not the link target.
- `supabase link` writes the ref to `supabase/.temp/project-ref`, which
  `.gitignore` already excludes. It is ambient local state, not a safety mechanism.

Isolation therefore rests on four things that are real:

1. **The new org is the boundary.** Creating with an explicit `--org-id` means
   Alain's project is not among the candidates.
2. **The ref is recorded in the repo** — in `README.md`, alongside the existing
   setup steps — so "is this linked correctly?" is checkable rather than
   remembered. A project ref is not a secret; it is already public in
   `NEXT_PUBLIC_SUPABASE_URL`.
3. **`supabase db push --dry-run` precedes every real push**, with the target ref
   verified first. This is the step that catches a bad link before it writes.
4. **Env separation.** `web/.env.local` carries only this project's keys.

## What gets created

1. Org `AI agents for dumbphones` (`supabase orgs create`; new orgs default to the
   Free plan — no plan flag exists).
2. Project `ai-agents-for-dumbphones` in `eu-central-1`, in that org.
3. `supabase/config.toml` via `supabase init` in this repo.
4. A link from this repo to the new project ref.
5. Both migrations applied via `db push`, dry-run first.
6. The new project ref recorded in `README.md`.
7. Alain's project renamed to `alain-landing`.

## Data flow

Unchanged from the existing architecture:

- `web/` (Next.js, Vercel) → Supabase: anon key client-side
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`), service-role key
  server-side only (`SUPABASE_SERVICE_ROLE_KEY`).
- `runtime/` never touches Supabase directly. It calls the web API
  (`/api/runtime/session`, `/api/tools/execute`, `/api/runtime/end`), preserving the
  separation the launch plan relies on.
- RLS policies enforce per-user access across all ten tables.

## Secrets

The database password is generated at creation and held by the maintainer. It will
not be written to the repo or pasted into chat. The same applies to the service-role
key (Vercel env only) and `ENCRYPTION_KEY` (`openssl rand -base64 32`), which
encrypts stored Google OAuth tokens.

## Verification

- `supabase projects list` shows the new project under the **new** org.
- `db push --dry-run` reports the expected ref and the two pending migrations.
- After push: ten tables (`profiles`, `phones`, `google_connections`, `consents`,
  `reminders`, `memories`, `call_logs`, `sms_logs`, `outbound_jobs`,
  `important_senders`), each with RLS enabled.
- Alain's project: ref `hsjslkndzuchlysloxcx` unchanged, no migrations applied,
  rename is the only difference.

## Risks

- **Free projects pause after inactivity.** A demo advertised as "call this number
  any time" that sits quiet for a week will be paused when someone finally calls.
  This needs an answer before the number is published — a paid plan, or a keep-alive.
  Out of scope here; flagged for the deployment spec.
- **The free-project cap is unknown.** It could not be determined from the CLI. If
  creation hits a limit, this will be reported rather than worked around, since the
  remedies (pausing Alain's project, paying, restructuring orgs) are the
  maintainer's call.

## Follow-ups

- Specs for the remaining Track 4 pieces: Vercel deployment, runtime host, Twilio
  number.
