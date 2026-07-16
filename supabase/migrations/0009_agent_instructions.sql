-- Free-text custom instructions the person writes for their own agent, from the
-- web personal area ("Mon agent"). Injected into the inbound system prompt so
-- the caller can shape tone and standing preferences ("call me vous", "keep it
-- very short", "I'm hard of hearing, speak slowly") without touching code.
--
-- Nullable and no default: an empty field means "no custom instructions", which
-- is the current behaviour. These are style/behaviour guidance only — they never
-- override the confirm-before-acting rule or the SMS-code gate (see inbound.ts).
-- No PII belongs here; like preferred_name it rides in the base prompt, which is
-- deliberately kept free of address/memories/contacts.

alter table public.profiles
  add column if not exists agent_instructions text;
