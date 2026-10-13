-- Phase 1: equipment registry.
--
-- Machines on a customer's site become first-class rows, and contracts, visits
-- and complaints point at one. "Which unit does this contract cover?" becomes a
-- lookup instead of guesswork.
--
-- Every statement is idempotent, so it is safe to run more than once. Paste this
-- whole block into Supabase → SQL Editor and press Run.

create table if not exists assets (
  id             text primary key,
  customer_id    text not null,
  name           text not null,
  category       text not null default 'Other',
  model          text,
  serial_no      text,
  capacity       text,
  installed_on   date,
  warranty_until date,
  location_note  text,
  status         text not null default 'Active',
  created_at     timestamptz not null default now()
);

create index if not exists assets_customer_idx on assets (customer_id);

-- Grants. A table created through the SQL editor does not pick up the default
-- privileges that the dashboard UI applies, so without these PostgREST answers
-- 403 "permission denied for table assets" and the register silently shows an
-- empty list. Safe to re-run.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on assets to service_role;
grant select, insert, update, delete on assets to authenticated;
grant select on assets to anon;

-- Row level security, matching how every other table in this schema is set up.
-- Without a policy the app's writes are all rejected with "new row violates
-- row-level security policy for table assets" while reads quietly return
-- nothing, so the register looks empty and the app never reports a failure.
alter table assets enable row level security;
drop policy if exists "assets_all_authenticated" on assets;
-- create policy has no "if not exists", so re-pasting this migration
-- aborts on the second run. Dropping first makes the file idempotent.
drop policy if exists "assets_all_authenticated" on assets;

create policy "assets_all_authenticated" on assets
  for all using (auth.role() = 'authenticated');

-- A contract normally covers one machine. Left nullable so the site-wide
-- contracts that already exist keep working unchanged.
alter table amcs       add column if not exists asset_id text;
alter table services   add column if not exists asset_id text;
alter table complaints add column if not exists asset_id text;

create index if not exists amcs_asset_idx       on amcs (asset_id);
create index if not exists services_asset_idx   on services (asset_id);
create index if not exists complaints_asset_idx on complaints (asset_id);

-- Kept as plain text columns rather than foreign keys, matching how
-- payments.amc_id already works: the app unlinks rows explicitly on delete, and
-- a stale pointer can never block a contract or a machine from being removed.
