-- Plateforme d'agent vocal — schéma initial (Postgres / Supabase, région EU)
-- Toutes les données personnelles restent dans cette base (résidence EU).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profils utilisateurs (1:1 avec auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  preferred_name text,                -- comment l'agent doit appeler la personne
  locale text not null default 'fr-FR',
  home_address text,                  -- pour la navigation ("chez moi")
  voice_speed numeric not null default 0.85, -- débit ralenti par défaut (personnes âgées)
  pin_hash text,                      -- scrypt du PIN parlé (actions sensibles)
  onboarding_step text not null default 'phone', -- phone | google | consents | pin | done
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Numéros de téléphone vérifiés (caller-ID -> compte)
-- ---------------------------------------------------------------------------
create table public.phones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  e164 text not null unique,          -- +33612345678
  label text not null default 'principal',
  verified_at timestamptz,            -- null tant que l'OTP n'est pas confirmé
  created_at timestamptz not null default now()
);
create index phones_user_idx on public.phones (user_id);

-- ---------------------------------------------------------------------------
-- Connexions Google (tokens OAuth chiffrés côté application, AES-256-GCM)
-- ---------------------------------------------------------------------------
create table public.google_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  google_email text not null,
  refresh_token_enc text not null,    -- chiffré applicativement, jamais en clair
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Registre de consentements (append-only : on n'update jamais, on ajoute)
-- ---------------------------------------------------------------------------
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null,               -- calendar | mail | contacts | outbound_calls | sms | memory | recording
  granted boolean not null,
  scope_note text,                    -- texte exact montré à l'utilisateur
  created_at timestamptz not null default now()
);
create index consents_user_source_idx on public.consents (user_id, source, created_at desc);

-- Vue : dernier état de consentement par source
create view public.current_consents as
select distinct on (user_id, source)
  user_id, source, granted, created_at
from public.consents
order by user_id, source, created_at desc;

-- ---------------------------------------------------------------------------
-- Rappels (skill Reminders + "est-ce que j'ai déjà… ?")
-- ---------------------------------------------------------------------------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  text text not null,
  due_at timestamptz,                 -- null = simple note "did_i_already"
  recurrence text,                    -- null | daily | weekly | monthly
  status text not null default 'pending', -- pending | sent | done | cancelled
  done_at timestamptz,                -- pour "did_i_already" : quand l'action a été confirmée faite
  deliver_via text not null default 'sms', -- sms | call
  created_at timestamptz not null default now()
);
create index reminders_due_idx on public.reminders (status, due_at);
create index reminders_user_idx on public.reminders (user_id);

-- ---------------------------------------------------------------------------
-- Mémoire par utilisateur (préférences, lieux fréquents, raccourcis contacts)
-- ---------------------------------------------------------------------------
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  key text not null,                  -- ex: "médecin traitant", "boulangerie"
  value text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

-- ---------------------------------------------------------------------------
-- Journal des appels (entrants et sortants)
-- ---------------------------------------------------------------------------
create table public.call_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  direction text not null,            -- inbound | outbound
  vapi_call_id text unique,
  agent text not null default 'assistant', -- assistant | docteur | taxi | resto | generic
  from_number text,
  to_number text,
  pin_verified boolean not null default false,
  transcript text,
  summary text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_reason text
);
create index call_logs_user_idx on public.call_logs (user_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Journal SMS
-- ---------------------------------------------------------------------------
create table public.sms_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  direction text not null,            -- inbound | outbound
  e164 text not null,
  body text not null,
  kind text not null default 'generic', -- generic | route_steps | reminder | outbound_report | otp
  created_at timestamptz not null default now()
);
create index sms_logs_user_idx on public.sms_logs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- File d'attente des appels sortants (Docteur / Taxi / Résa / générique)
-- ---------------------------------------------------------------------------
create table public.outbound_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,                 -- docteur | taxi | resto | generic
  goal text not null,                 -- objectif en français clair
  target_number text,                 -- numéro à appeler (si connu)
  target_name text,                   -- "Cabinet du Dr Martin"
  constraints jsonb not null default '{}'::jsonb, -- créneaux, nb personnes, adresse…
  callback_number text not null,      -- numéro du senior à tenir informé
  status text not null default 'pending', -- pending | calling | done | failed | needs_user
  attempts int not null default 0,
  max_attempts int not null default 3,
  vapi_call_id text,
  result text,                        -- compte-rendu final (envoyé par SMS)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index outbound_jobs_status_idx on public.outbound_jobs (status, created_at);

-- ---------------------------------------------------------------------------
-- Expéditeurs importants (skill Mail, phase 1)
-- ---------------------------------------------------------------------------
create table public.important_senders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  email text not null,
  label text,
  created_at timestamptz not null default now(),
  unique (user_id, email)
);

-- ---------------------------------------------------------------------------
-- RLS : l'utilisateur ne voit que ses données ; le serveur passe par la
-- service_role key (bypass RLS) pour la téléphonie.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.phones enable row level security;
alter table public.google_connections enable row level security;
alter table public.consents enable row level security;
alter table public.reminders enable row level security;
alter table public.memories enable row level security;
alter table public.call_logs enable row level security;
alter table public.sms_logs enable row level security;
alter table public.outbound_jobs enable row level security;
alter table public.important_senders enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own phones" on public.phones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own google" on public.google_connections
  for select using (auth.uid() = user_id);
create policy "own consents" on public.consents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own reminders" on public.reminders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own memories" on public.memories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own calls" on public.call_logs
  for select using (auth.uid() = user_id);
create policy "own sms" on public.sms_logs
  for select using (auth.uid() = user_id);
create policy "own jobs" on public.outbound_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own senders" on public.important_senders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Création automatique du profil à l'inscription
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
