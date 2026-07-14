-- Limite de débit sur le numéro entrant (web/src/lib/rate-limit.ts).
--
-- Vapi attend une réponse à assistant-request en ~7,5 s, et chaque appel
-- entrant compte désormais les appels récents : par appelant sur 1 h, par
-- appelant sur 24 h, et globalement sur 24 h. L'index existant est
-- (user_id, started_at) — inutile ici, car un appelant inconnu a user_id null
-- et le plafond global ne filtre pas sur l'utilisateur.

create index if not exists call_logs_inbound_caller_idx
  on public.call_logs (direction, from_number, started_at desc);

create index if not exists call_logs_inbound_recent_idx
  on public.call_logs (direction, started_at desc);
