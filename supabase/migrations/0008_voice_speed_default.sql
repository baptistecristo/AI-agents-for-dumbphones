-- Default speaking rate back to normal.
-- 0.85 was a slowed rate chosen for the project's original audience; the agent
-- now answers general callers, so a normal rate is the sensible default.
-- voice_speed stays per-profile, so a caller who wants a slower agent can set it.

alter table profiles
  alter column voice_speed set default 1.0;

-- Existing profiles still carry the old default, so move them across too.
-- Scoped to rows still sitting on 0.85: any profile that picked a different
-- rate keeps it untouched.
update profiles
   set voice_speed = 1.0
 where voice_speed = 0.85;
