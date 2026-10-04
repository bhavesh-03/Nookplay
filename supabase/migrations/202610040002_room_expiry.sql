-- Existing rooms keep their original 24-hour lifetime.
alter table public.nookplay_rooms add column if not exists expires_at timestamptz;
update public.nookplay_rooms
set expires_at = created_at + interval '24 hours'
where expires_at is null;
alter table public.nookplay_rooms alter column expires_at set not null;
alter table public.nookplay_rooms alter column expires_at set default (now() + interval '24 hours');
create index if not exists nookplay_rooms_expires_at_idx on public.nookplay_rooms (expires_at);

-- The API rejects expired rooms immediately. This job removes their stored data.
create extension if not exists pg_cron;
select cron.schedule(
  'nookplay-expired-rooms',
  '*/15 * * * *',
  $$ delete from public.nookplay_rooms where expires_at <= now() $$
);
