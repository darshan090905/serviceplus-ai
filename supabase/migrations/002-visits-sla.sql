-- Phase 2: preventive maintenance cadence and complaint SLA clocks.
--
-- Two independent additions, both idempotent. Paste the whole block into
-- Supabase → SQL Editor and press Run. No existing row is modified.

-- ---------------------------------------------------------------------
-- Preventive maintenance
-- ---------------------------------------------------------------------
-- A contract that has never been given a cadence must not quietly start
-- generating visits, so both columns are nullable: null next_visit_on means
-- "nothing scheduled", and the generator only ever looks at rows that have one.
alter table amcs add column if not exists visits_per_year int;
alter table amcs add column if not exists next_visit_on date;

-- The generator's only question is "which contracts are due", so the index
-- covers just the scheduled rows rather than the whole table.
create index if not exists amcs_next_visit_idx on amcs (next_visit_on)
  where next_visit_on is not null;

-- Guards a value that would otherwise schedule a visit every 0 days. A
-- contract written as 0 visits a year is a typo, not an intent, so it is
-- rejected at the database rather than trusted from the client.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'amcs_visits_per_year_check') then
    alter table amcs add constraint amcs_visits_per_year_check
      check (visits_per_year is null or (visits_per_year > 0 and visits_per_year <= 52));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Complaint SLA
-- ---------------------------------------------------------------------
-- respond_by is the deadline for getting a technician onto the job;
-- resolve_by is the deadline for closing it. breached latches, so a complaint
-- that was fixed an hour late still reads as breached rather than quietly
-- returning to normal the moment it is resolved.
--
-- Existing complaints are left null on purpose. Backfilling a deadline for a
-- complaint raised before this feature existed would invent a due date that
-- nobody agreed to, so those rows simply show no SLA.
alter table complaints add column if not exists sla_respond_by timestamptz;
alter table complaints add column if not exists sla_resolve_by timestamptz;
alter table complaints add column if not exists sla_breached    boolean not null default false;
alter table complaints add column if not exists responded_at    timestamptz;
alter table complaints add column if not exists resolved_at     timestamptz;

-- Breach review and the "about to breach" query both filter on resolve_by.
create index if not exists complaints_sla_idx on complaints (sla_resolve_by)
  where sla_resolve_by is not null;

-- A generated visit has to point back at the contract that earned it, or it is
-- indistinguishable from an ad-hoc breakdown call after the fact. Nullable, so
-- every existing service row is untouched.
alter table services add column if not exists amc_id text;
create index if not exists services_amc_idx on services (amc_id)
  where amc_id is not null;
