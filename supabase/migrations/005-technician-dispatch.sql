-- 005 — Technician dispatch.
--
-- Three things happen here, in the order they depend on each other:
--
--   1. Stable technician identity on the two tables that were assigning people
--      by typed name.
--   2. A scheduled time and a duration, so a week board can place a visit.
--   3. A link from a complaint back to the visit that addressed it, which is
--      what makes a first-time-fix figure a measurement rather than a guess.
--
-- Every statement is idempotent. These files are pasted by hand into the SQL
-- editor, so a re-paste is routine, and several statements here have no
-- conditional form at all — `create policy` and `add constraint` both abort on
-- the second run unless they are explicitly guarded, which is why each one is
-- wrapped rather than left bare.
--
-- On the time column: this is `date` + minutes-from-midnight rather than a
-- timestamptz. A visit is a wall-clock appointment at a customer's address, so
-- the only thing that can go wrong with a timestamptz here is the conversion,
-- and this codebase has already been bitten by that once — `toISOString()` in
-- utils/dates.ts was quietly returning the previous day in IST. Storing a local
-- time-of-day beside a local date cannot be shifted by a timezone at all.

-- ---------------------------------------------------------------------
-- 1. Technician identity
-- ---------------------------------------------------------------------
-- `services.technician` and `complaints.assigned_to` are free text, and always
-- will be: they predate any account and hold names that no longer match anybody
-- in `profiles`. Rather than rewrite history, the typed name is kept as the
-- display value and a resolved id is added beside it. Where no profile matches,
-- the id stays null and the UI shows the visit as unresolved — inventing a
-- technician from a spelling variant would be worse than admitting we do not
-- know who it was.
alter table services   add column if not exists technician_id text;
alter table complaints add column if not exists assigned_to_id text;

-- The visit a complaint was fixed by. Nullable and plain text to match
-- `services.asset_id`; there is no foreign key, because a visit can be deleted
-- without the complaint that referenced it being wrong, and a dangling pointer
-- is preferable to a cascade that silently erases the evidence a rework figure
-- depends on.
alter table complaints add column if not exists service_id text;

-- Backfill by name, case- and space-insensitively, matching either the profile's
-- technician id or its display name — the two tables were keyed differently, so a
-- visit typed with somebody's display name against a profile that only has an id
-- has to resolve too.
--
-- A row is only filled in when the text matches exactly one profile. An
-- ambiguous name is left null on purpose: two technicians called Ravi is a
-- question for a human, and picking one would put another person's name on a
-- visit. Only rows that are still null are touched, so this is safe against a
-- database where the app has already written a resolved id.
with matches as (
  select s.id as row_id,
         min(p.technician_id) as technician_id,
         count(*) as candidate_count
    from services s
    join profiles p
      on p.role = 'technician'
     and coalesce(nullif(trim(p.technician_id), ''), null) is not null
     and lower(trim(s.technician))
         in (lower(trim(p.technician_id)), lower(trim(coalesce(p.name, ''))))
   where s.technician_id is null
   group by s.id
)
update services s
   set technician_id = m.technician_id
  from matches m
 where s.id = m.row_id
   and m.candidate_count = 1;

with matches as (
  select c.id as row_id,
         min(p.technician_id) as technician_id,
         count(*) as candidate_count
    from complaints c
    join profiles p
      on p.role = 'technician'
     and coalesce(nullif(trim(p.technician_id), ''), null) is not null
     and lower(trim(c.assigned_to))
         in (lower(trim(p.technician_id)), lower(trim(coalesce(p.name, ''))))
   where c.assigned_to_id is null
   group by c.id
)
update complaints c
   set assigned_to_id = m.technician_id
  from matches m
 where c.id = m.row_id
   and m.candidate_count = 1;

-- ---------------------------------------------------------------------
-- 2. A scheduled slot
-- ---------------------------------------------------------------------
-- Minutes from local midnight, 0 to 1439. Null means "no start time recorded",
-- which is not the same as midnight and is rendered as blank: a visit with no
-- start time must not appear in the 12:00 am slot, or every unscheduled visit
-- on the board looks like it was booked for the middle of the night.
alter table services add column if not exists start_minute integer;
alter table services add column if not exists duration_minutes integer;

-- `add constraint` has no conditional form, so each is guarded. Without this a
-- second paste of this file fails on the first constraint and never reaches the
-- backfill, leaving a half-applied migration.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'services_start_minute_check') then
    alter table services
      add constraint services_start_minute_check
      check (start_minute is null or (start_minute >= 0 and start_minute < 1440));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'services_duration_minutes_check') then
    alter table services
      add constraint services_duration_minutes_check
      check (duration_minutes is null or duration_minutes > 0);
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------
-- The week board reads a date range across all technicians on every load, and
-- `services.date` had no index at all, so that was a sequential scan over the
-- whole visit history.
create index if not exists services_date_idx on services (date);
create index if not exists services_technician_date_idx on services (technician_id, date);
create index if not exists services_technician_idx on services (technician_id) where technician_id is not null;
create index if not exists complaints_service_idx on complaints (service_id) where service_id is not null;

-- ---------------------------------------------------------------------
-- 4. Realtime
-- ---------------------------------------------------------------------
-- `services` was the one live entity with neither a realtime subscription nor a
-- bulk write, so a visit appearing or moving on the board only showed up on the
-- next 30-second poll. This adds it to the publication; the subscription itself
-- lives in services/supabase.ts.
--
-- The poll is kept deliberately. When the publication has not been applied the
-- subscription still connects and then silently receives nothing, which looks
-- exactly like a quiet board — so the poll is the only thing standing between a
-- forgotten migration and a dispatch screen that just never updates.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'services'
     )
  then
    alter publication supabase_realtime add table public.services;
  end if;
end;
$$;
