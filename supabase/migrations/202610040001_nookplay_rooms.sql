-- Nookplay stores one room as one JSON document so each host action can be
-- committed with a revision check. Credentials in state are SHA-256 hashes.
create table if not exists public.nookplay_rooms (
  code text primary key check (code ~ '^[A-Z2-9]{6}$'),
  revision bigint not null check (revision > 0),
  state jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.nookplay_rooms enable row level security;
revoke all on public.nookplay_rooms from anon, authenticated;
grant select, insert, update, delete on public.nookplay_rooms to service_role;

create index if not exists nookplay_rooms_created_at_idx on public.nookplay_rooms (created_at);
