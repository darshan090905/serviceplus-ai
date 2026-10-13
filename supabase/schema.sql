-- =====================================================================
-- ServicePulse — Supabase schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
--
-- =====================================================================
-- !! DO NOT RUN THIS AGAINST A DATABASE THAT ALREADY HAS DATA. !!
--
-- This file is a from-scratch build script, not a migration. It is meant for
-- an empty database. It is NOT safe to re-apply to a live one, and it will
-- fail halfway if you try:
--
--   * it drops public.is_admin() without CASCADE, but ten RLS policies depend
--     on that function, so Postgres rejects it with 2BP01. The policies were
--     created earlier in this same file, so the drop can only ever succeed on a
--     database where no policies exist yet - i.e. an empty one.
--   * it also drops public.is_staff() and public.my_customer_id() the same way.
--
-- Do not "fix" that with DROP ... CASCADE. CASCADE would silently drop all ten
-- policies, and because the editor runs the batch in one transaction a later
-- error would roll the whole thing back anyway, leaving you guessing.
--
-- For a database that already has data, apply the numbered files in
-- supabase/migrations/ instead, in order. They are written to be re-runnable:
-- add column if not exists, drop policy if exists, create or replace function.
-- Each one states what it does and why.
-- ---------------------------------------------------------------------
--
-- The React app hydrates from these tables on mount and writes each row back
-- as it changes, so data survives reloads.
--
-- RLS is role-scoped. Early in the build every table was left open to any
-- signed-in user "for the demo", which meant any customer account could read
-- and rewrite every other customer's records. That is no longer the case: the
-- role-scoped policies at the end of this file replace the blanket ones, and
-- the job-evidence tables and the job-evidence storage bucket are no longer
-- readable without a role. See supabase/migrations/006-role-scoped-rls.sql
-- for the migration that applies the same change to an existing database.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Accounts (auth users + approval profiles)
-- id        = business account id (ACC-1, ACC-201 …) used by the UI
-- auth_uid  = the auth.users id created by Supabase Auth signUp/signUp.admin
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id            text primary key,
  auth_uid      uuid references auth.users (id) on delete cascade,
  name          text not null,
  email         text not null,
  role          text not null check (role in ('customer', 'technician')),
  status        text not null default 'pending' check (status in ('pending', 'active', 'rejected')),
  customer_id   text,
  technician_id text,
  company       text,
  service_types jsonb not null default '[]'::jsonb,
  city          text,
  note          text,
  requested_at  timestamptz not null default now(),
  approved_at   timestamptz
);
create unique index if not exists profiles_email_idx on profiles (lower(email));

-- Create the profile row in the same transaction as auth.signup.
-- This avoids a client-side second write and prevents false failures when
-- the auth user exists but the profile insert races or hits RLS.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    auth_uid,
    name,
    email,
    role,
    status,
    company,
    service_types,
    city,
    requested_at
  )
  values (
    new.id::text,
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', coalesce(split_part(new.email, '@', 1), 'User')),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'role', 'customer'),
    'pending',
    nullif(new.raw_user_meta_data ->> 'company', ''),
    coalesce((new.raw_user_meta_data -> 'service_types')::jsonb, '[]'::jsonb),
    nullif(new.raw_user_meta_data ->> 'city', ''),
    now()
  )
  on conflict (id) do update set
    auth_uid = excluded.auth_uid,
    name = excluded.name,
    email = excluded.email,
    role = excluded.role,
    status = excluded.status,
    company = excluded.company,
    service_types = excluded.service_types,
    city = excluded.city,
    requested_at = excluded.requested_at;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- Domain tables
-- ---------------------------------------------------------------------
create table if not exists customers (
  id            text primary key,
  name          text not null,
  company       text not null,
  email         text not null,
  phone         text not null,
  address       text not null,
  city          text not null,
  type          text not null check (type in ('Individual', 'Business')),
  service_types jsonb not null default '[]'::jsonb,
  joined        date,
  factors       jsonb not null default '[]'::jsonb,
  health        int not null default 100
);

create table if not exists amcs (
  id             text primary key,
  customer_id    text not null references customers (id) on delete cascade,
  service_type   text not null,
  start_date     date,
  end_date       date,
  amount         numeric not null default 0,
  status         text not null,
  renewal_status text not null default 'None'
);
create index if not exists amcs_customer_idx on amcs (customer_id);

-- Contracts are renewed on a specific day, chosen on a calendar in the AMC
-- form. Additive migration for databases created before this column existed.
alter table amcs add column if not exists renewal_date date;

create table if not exists services (
  id           text primary key,
  customer_id  text not null references customers (id) on delete cascade,
  service_type text not null,
  date         date,
  technician   text not null,
  status       text not null,
  rating       int,
  notes        text
);
create index if not exists services_customer_idx on services (customer_id);
-- On-site time tracking + customer-pinned location. Additive migration for
-- databases created before these columns existed.
alter table services add column if not exists check_in_at timestamptz;
alter table services add column if not exists check_out_at timestamptz;
alter table services add column if not exists arrived_lat double precision;
alter table services add column if not exists arrived_lng double precision;
alter table services add column if not exists customer_lat double precision;
alter table services add column if not exists customer_lng double precision;
alter table services add column if not exists location_shared_at timestamptz;

create table if not exists complaints (
  id           text primary key,
  customer_id  text not null references customers (id) on delete cascade,
  category     text not null,
  description  text not null,
  severity     text not null,
  status       text not null,
  created      timestamptz not null default now(),
  assigned_to  text not null,
  service_type text,
  resolution   text,
  analysis     jsonb,
  satisfaction int,
  feedback     text
);
-- Existing databases created before feedback existed need an additive
-- migration first; create table if not exists is a no-op on them.
alter table complaints add column if not exists feedback text;
-- Service-location tracking + technician work timeline for complaints.
-- Additive migration for databases created before these columns existed.
alter table complaints add column if not exists latitude double precision;
alter table complaints add column if not exists longitude double precision;
alter table complaints add column if not exists location_address text;
alter table complaints add column if not exists location_shared_at timestamptz;
alter table complaints add column if not exists assigned_at timestamptz;
alter table complaints add column if not exists arrived_at timestamptz;
alter table complaints add column if not exists arrival_lat double precision;
alter table complaints add column if not exists arrival_lng double precision;
alter table complaints add column if not exists work_started_at timestamptz;
alter table complaints add column if not exists work_completed_at timestamptz;
alter table complaints add column if not exists resolved_at timestamptz;
create index if not exists complaints_customer_idx on complaints (customer_id);

create table if not exists payments (
  id          text primary key,
  invoice     text not null,
  customer_id text not null references customers (id) on delete cascade,
  amc_id      text,
  amount      numeric not null default 0,
  due_date    date,
  paid_date   date,
  status      text not null,
  method      text,
  reference_id text
);
-- Existing databases created before reference_id existed need an additive
-- migration first; create table if not exists is a no-op on them.
alter table payments add column if not exists reference_id text;
create index if not exists payments_customer_idx on payments (customer_id);
create unique index if not exists payments_reference_idx on payments (reference_id) where reference_id is not null;

create table if not exists notifications (
  id          text primary key,
  title       text not null,
  description text not null,
  time        date not null default current_date,
  type        text not null,
  read        boolean not null default false,
  customer_id text,
  link        text
);

-- Live complaint chat: one row per message. Anyone in the loop (admin, the
-- customer who raised the complaint, the assigned technician) can start and
-- reply to the thread; every open tab updates in real time via Realtime.
create table if not exists complaint_messages (
  id           text primary key,
  complaint_id text not null references complaints (id) on delete cascade,
  sender_role  text not null check (sender_role in ('customer', 'admin', 'technician')),
  sender_name  text not null,
  body         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists complaint_messages_complaint_idx on complaint_messages (complaint_id);

create table if not exists outbox_emails (
  id       text primary key,
  recipient text not null,
  to_email text not null,
  subject  text not null,
  body     text not null,
  type     text not null,
  sent_at  date not null default current_date,
  read     boolean not null default false,
  status   text not null default 'queued'
);
-- Existing databases created before status existed need an additive
-- migration first; create table if not exists is a no-op on them.
alter table outbox_emails add column if not exists status text not null default 'queued';

-- In-app AI call queue: when the admin assigns a complaint to a technician,
-- the assign path queues a call row here. The technician's portal (Realtime)
-- rings, the tech accepts/declines, and the status advances
-- queued -> ringing -> answered | missed. Mirrors outbox_emails + n8n queueing.
create table if not exists outbox_calls (
  id           text primary key,
  to_name      text not null,
  complaint_id text,
  type         text not null default 'assignment',
  message      text not null,
  status       text not null default 'queued',
  created_at   timestamptz not null default now(),
  read         boolean not null default false
);
alter table outbox_calls add column if not exists complaint_id text;
alter table outbox_calls add column if not exists message text not null default '';
alter table outbox_calls add column if not exists status text not null default 'queued';

create table if not exists retention_actions (
  id                text primary key,
  customer_id       text not null references customers (id) on delete cascade,
  primary_risk      text not null,
  recommended_action text not null,
  steps             jsonb not null default '[]'::jsonb,
  reason            text not null,
  priority          int not null,
  status            text not null default 'Pending',
  owner             text not null,
  revenue_at_risk   numeric not null default 0,
  requires_approval boolean not null default false,
  renewal_offer     jsonb
);
alter table retention_actions add column if not exists renewal_offer jsonb;
create index if not exists retention_customer_idx on retention_actions (customer_id);

-- ---------------------------------------------------------------------
-- Row Level Security (demo scope)
-- ---------------------------------------------------------------------
alter table profiles          enable row level security;
alter table customers         enable row level security;
alter table amcs              enable row level security;
alter table services          enable row level security;
alter table complaints        enable row level security;
alter table payments          enable row level security;
alter table notifications     enable row level security;
alter table complaint_messages enable row level security;
alter table outbox_emails     enable row level security;
alter table outbox_calls      enable row level security;
alter table retention_actions enable row level security;
alter table assets            enable row level security;

-- Profiles: a user can create their own; any authenticated user may read and
-- update (demo — admin approve/reject/edit writes straight through).
-- The insert policy also permits the anon signup path (email confirmation
-- enabled, so no session exists yet) to write the pending profile carrying
-- the auth_uid just returned by signUp. An authenticated user may ONLY ever
-- insert a row bound to their own auth_uid — never onto another user's.
drop policy if exists "profiles_insert_own" on profiles;

create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = auth_uid or (auth.role() = 'anon' and auth_uid is not null));
drop policy if exists "profiles_select_authenticated" on profiles;

create policy "profiles_select_authenticated" on profiles
  for select using (auth.role() = 'authenticated');
drop policy if exists "profiles_update_authenticated" on profiles;

create policy "profiles_update_authenticated" on profiles
  for update using (auth.role() = 'authenticated');
drop policy if exists "profiles_delete_authenticated" on profiles;

create policy "profiles_delete_authenticated" on profiles
  for delete using (auth.role() = 'authenticated');

-- Everything else: authenticated users can read and write (demo).
do $$
declare
  t text;
begin
  foreach t in array array['customers','amcs','services','complaints','payments','notifications','complaint_messages','outbox_emails','outbox_calls','retention_actions','assets']
  loop
    execute format('drop policy if exists "%s_all_authenticated" on %s', t, t);
    execute format('create policy "%s_all_authenticated" on %s for all using (auth.role() = ''authenticated'')', t, t);
  end loop;
end $$;

-- The anon + authenticated API roles need explicit privileges on every
-- table. Without these grants the REST API sees "permission denied for
-- table …" even when an RLS policy permits the row.
do $$
declare
  t text;
begin
  foreach t in array array['profiles','customers','amcs','services','complaints','payments','notifications','complaint_messages','outbox_emails','outbox_calls','retention_actions','assets']
  loop
    execute format('grant all on table %I to anon, authenticated, service_role', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Cross-device demo payments
-- ---------------------------------------------------------------------

-- Unauthenticated visitors (the phone's public /pay/:refId page) may NOT
-- read the payments table directly — an open SELECT would leak every
-- customer's invoices. Instead they call get_payment_by_reference(), a
-- security-definer function that only returns the single row whose
-- reference_id they know (the QR contents). Writes stay locked down: anon
-- can ONLY complete a payment through the pay_complete() function below,
-- which is restricted to flipping unpaid invoices to Paid.
drop policy if exists "payments_select_anon" on payments;

-- Returns the payment row for a known reference_id, or zero rows.
-- security definer: bypasses the table-level RLS so anon can read just
-- this one row without a blanket anon SELECT policy.
create or replace function public.get_payment_by_reference(p_ref text)
returns setof payments
language sql
security definer
set search_path = public
as $$
  select * from payments
  where reference_id = p_ref
  limit 1;
$$;

grant execute on function public.get_payment_by_reference(text) to anon, authenticated;

-- Complete a pending invoice from the phone. Guards against replay: only
-- Pending / Overdue / Partially Paid rows can be paid, and the caller must
-- know the random reference_id (the QR contents). Returns 'OK' on success
-- or 'NOT_FOUND' when the link is stale.
create or replace function public.pay_complete(p_ref text, p_method text default 'UPI')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id text;
begin
  select id into target_id
  from payments
  where reference_id = p_ref
    and status in ('Pending', 'Overdue', 'Partially Paid')
  limit 1;

  if target_id is null then
    return 'NOT_FOUND';
  end if;

  update payments
  set status = 'Paid',
      paid_date = current_date,
      method = coalesce(nullif(p_method, ''), 'UPI')
  where id = target_id;

  return 'OK';
end;
$$;

grant execute on function public.pay_complete(text, text) to anon, authenticated;

-- Realtime: stream payments changes to every open tab so the customer
-- portal and the admin dashboard update live after a phone completes a
-- payment. Idempotent — safe to re-run.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and tablename = 'payments'
     )
  then
    alter publication supabase_realtime add table public.payments;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and tablename = 'profiles'
     )
  then
    alter publication supabase_realtime add table public.profiles;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and tablename = 'complaints'
     )
  then
    alter publication supabase_realtime add table public.complaints;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and tablename = 'notifications'
     )
  then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and tablename = 'outbox_emails'
     )
  then
    alter publication supabase_realtime add table public.outbox_emails;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and tablename = 'outbox_calls'
     )
  then
    alter publication supabase_realtime add table public.outbox_calls;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and tablename = 'complaint_messages'
     )
  then
    alter publication supabase_realtime add table public.complaint_messages;
  end if;
end $$;

-- Payment-received notifications: when an invoice flips to Paid (the customer
-- portal button OR the phone's public /pay/:refId page), insert a notification
-- row so every admin/customer tab picks it up live via Realtime. Security
-- definer so the insert works regardless of who performs the update.
create or replace function notify_payment_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_name text;
  recipient_email text;
begin
  insert into notifications (id, title, description, time, type, read, customer_id, link)
  values (
    'N-' || gen_random_uuid()::text,
    'Payment received · ' || NEW.invoice,
    'Invoice ' || NEW.invoice || ' for ₹' || NEW.amount || ' was paid.',
    current_date,
    'Payment',
    false,
    NEW.customer_id,
    '/payments'
  );

  -- Queue a receipt for n8n. This runs for both admin/portal updates and
  -- public QR payments, so customers receive the confirmation no matter
  -- which payment screen they use.
  select name, email into recipient_name, recipient_email
  from customers
  where id = NEW.customer_id;

  if recipient_email is not null then
    insert into outbox_emails (id, recipient, to_email, subject, body, type, sent_at, read, status)
    values (
      'E-' || gen_random_uuid()::text,
      coalesce(recipient_name, 'Customer'),
      recipient_email,
      'Payment successful · ' || NEW.invoice,
      'Dear ' || coalesce(recipient_name, 'Customer') || E',\n\nYour payment of ₹' || NEW.amount || ' for invoice ' || NEW.invoice || E' was successfully received.\n\nPayment method: ' || coalesce(NEW.method, 'UPI') || E'\nPayment date: ' || coalesce(NEW.paid_date, current_date) || E'\n\nThank you for your payment.\n\nServicePulse',
      'reminder',
      now(),
      false,
      'queued'
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_payments_paid on payments;
create trigger trg_payments_paid
after update on payments
for each row
when (NEW.status = 'Paid' and OLD.status is distinct from 'Paid')
execute function notify_payment_paid();

-- ---------------------------------------------------------------------------
-- Equipment registry (see supabase/migrations/001-assets.sql).
--
-- Machines on a customer's site, so a contract, visit or complaint can name the
-- exact unit it concerns instead of just the customer.
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

-- Grants, because a table created through the SQL editor does not inherit the
-- default privileges the dashboard UI applies. Without these, PostgREST returns
-- 403 and the register looks permanently empty.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on assets to service_role;
grant select, insert, update, delete on assets to authenticated;
grant select on assets to anon;

-- A contract normally covers one machine. Nullable, so the site-wide contracts
-- that already exist keep working unchanged.
alter table amcs       add column if not exists asset_id text;
alter table services   add column if not exists asset_id text;
alter table complaints add column if not exists asset_id text;

create index if not exists amcs_asset_idx       on amcs (asset_id);
create index if not exists services_asset_idx   on services (asset_id);
create index if not exists complaints_asset_idx on complaints (asset_id);

-- ---------------------------------------------------------------------------
-- Phase 2: preventive maintenance cadence and complaint SLA clocks
-- ---------------------------------------------------------------------------
-- Mirrors supabase/migrations/002-visits-sla.sql, with one deliberate
-- difference: the migration also runs
--   alter table complaints add column if not exists resolved_at timestamptz
-- which this file does not repeat, because the complaints CREATE TABLE above
-- already declares resolved_at. Every other statement is identical.
-- The reasoning behind each choice is written out in the migration; the short
-- version: nullable cadence columns mean a contract that never had one never
-- starts generating visits, and null SLA columns mean a complaint raised before
-- tracking existed is reported as unscored rather than backfilled with a due
-- date that nobody agreed to.
alter table amcs add column if not exists visits_per_year int;
alter table amcs add column if not exists next_visit_on date;

create index if not exists amcs_next_visit_idx on amcs (next_visit_on)
  where next_visit_on is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'amcs_visits_per_year_check') then
    alter table amcs add constraint amcs_visits_per_year_check
      check (visits_per_year is null or (visits_per_year > 0 and visits_per_year <= 52));
  end if;
end $$;

alter table complaints add column if not exists sla_respond_by timestamptz;
alter table complaints add column if not exists sla_resolve_by timestamptz;
alter table complaints add column if not exists sla_breached    boolean not null default false;
alter table complaints add column if not exists responded_at    timestamptz;

create index if not exists complaints_sla_idx on complaints (sla_resolve_by)
  where sla_resolve_by is not null;

-- A generated visit has to point back at the contract that earned it, or it is
-- indistinguishable from an ad-hoc breakdown call after the fact. Nullable, so
-- every existing service row is untouched.
alter table services add column if not exists amc_id text;
create index if not exists services_amc_idx on services (amc_id)
  where amc_id is not null;

-- Phase 3: proof of work
-- ---------------------------------------------------------------------------
-- Mirrors supabase/migrations/003-proof-of-work.sql. The full reasoning is in
-- that file; in short: image bytes live in Storage rather than Postgres, the
-- tables here are the index into that bucket plus the parts and sign-off
-- record, and the bucket is public with unguessable object names as a
-- deliberate tradeoff documented there.
-- Phase 3: proof of work.
--
-- Three additions, all idempotent. Paste the whole block into Supabase ->
-- SQL Editor and press Run. No existing row is modified.
--
-- The gap this closes: a completed service visit currently records "notes"
-- and a rating and nothing else. There is no way to show a customer what was
-- actually done, what was replaced, what it cost, or to hold anyone to a
-- claim. For a service business that is the difference between an anecdote
-- and a record.

-- ---------------------------------------------------------------------
-- Photo evidence
-- ---------------------------------------------------------------------
-- Binary data lives in Storage, not Postgres: images are large, PostgREST
-- row limits are 8MB, and keeping them out of the row means a machine with
-- twenty photos on every visit does not make the services table slow to
-- read. This table is the index into that bucket.
create table if not exists job_attachments (
  id           text primary key,
  service_id   text not null,
  kind         text not null default 'photo',
  -- Object name in the 'job-evidence' bucket. Not a URL: a public bucket URL
  -- is derived from it, so rotating the bucket's visibility does not
  -- invalidate every stored row.
  storage_path text not null,
  caption      text,
  -- Who took it. 'technician' until an admin is on the record, so the app can
  -- tell the difference between a customer-supplied photo and our own.
  taken_by     text,
  created_at   timestamptz not null default now()
);

-- Every read of a visit's evidence is "all of this visit's photos, oldest
-- first", which is exactly what a composite index on (service_id, created_at)
-- serves.
create index if not exists job_attachments_service_idx
  on job_attachments (service_id, created_at);

-- ---------------------------------------------------------------------
-- Parts used
-- ---------------------------------------------------------------------
-- Costing is recorded as money, not as a quantity times a lookup, because the
-- price charged is frequently not the list price and the invoice has to be
-- reproducible years later. unit_price_* are what the customer was charged;
-- cost_price is what we paid and never leaves the admin views.
create table if not exists job_parts (
  id            text primary key,
  service_id    text not null,
  name          text not null,
  quantity      numeric not null default 1,
  unit_price    numeric not null default 0,
  -- Margin is derived, not stored, so a later price correction cannot leave a
  -- stale percentage behind. Kept as a check because a negative part line is
  -- always a data-entry error.
  cost_price    numeric not null default 0,
  serial_no     text,
  created_at    timestamptz not null default now(),
  constraint job_parts_quantity_check   check (quantity > 0),
  constraint job_parts_unit_price_check check (unit_price >= 0),
  constraint job_parts_cost_check       check (cost_price >= 0)
);

create index if not exists job_parts_service_idx on job_parts (service_id);

-- ---------------------------------------------------------------------
-- Sign-off
-- ---------------------------------------------------------------------
-- The signature is one more attachment, captured on a canvas on the
-- technician's phone, stored as a PNG. It is not a cryptographic signature
-- and does not claim to be: it records that someone signed on a screen on a
-- given date, which is what a service sign-off sheet has always meant.
-- `signed_by` is typed by the technician and is a claim, not a fact, so it is
-- kept distinct from the image.
create table if not exists job_signatures (
  id          text primary key,
  service_id  text not null,
  storage_path text not null,
  signed_by   text not null,
  -- Free text the technician can fill in, e.g. "Ravi, Facilities Manager".
  role_note   text,
  created_at  timestamptz not null default now()
);

-- One signature per visit. A customer correcting a spelling should replace
-- the record, not leave the app arguing with itself over which of two
-- signatures counts.
create unique index if not exists job_signatures_service_uniq
  on job_signatures (service_id);

-- ---------------------------------------------------------------------
-- Storage bucket
-- ---------------------------------------------------------------------
-- PRIVATE, with display URLs minted per render by createSignedUrl().
--
-- History: this was public on purpose. The reasoning was that a private bucket
-- costs reliability, and bought little, because the table policies of the day
-- granted every authenticated user read and write on every table - a locked
-- door on an open room. Scoping every policy to staff-or-own-customer removed
-- that objection, leaving the door as the only thing guarding customer visit
-- photos and the customer's own signature on their own property. The
-- reliability cost is handled in the app: loadEvidence() in
-- src/services/jobService.ts mints every signed URL for a visit in one pass,
-- and ProofOfWorkPanel re-signs once on an image load error.
--
-- Stored storage_path values are unaffected. See migration 008.
insert into storage.buckets (id, name, public)
values ('job-evidence', 'job-evidence', false)
on conflict (id) do update set public = true;

-- Object names are the only thing keeping these private-by-obscurity, so the
-- policies deliberately do not restrict by path prefix: a partial-prefix rule
-- would be more code pretending to be a security boundary. What matters is
-- that an unauthenticated visitor cannot enumerate the bucket.
drop policy if exists "job_evidence_read" on storage.objects;

create policy "job_evidence_read" on storage.objects for select
  using (bucket_id = 'job-evidence');

drop policy if exists "job_evidence_write" on storage.objects;

create policy "job_evidence_write" on storage.objects for insert
  with check (bucket_id = 'job-evidence' and auth.role() = 'authenticated');

drop policy if exists "job_evidence_update" on storage.objects;

create policy "job_evidence_update" on storage.objects for update
  using (bucket_id = 'job-evidence' and auth.role() = 'authenticated');

drop policy if exists "job_evidence_delete" on storage.objects;

create policy "job_evidence_delete" on storage.objects for delete
  using (bucket_id = 'job-evidence' and auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
-- A table created through the SQL editor does not inherit the default
-- privileges the dashboard UI applies. Without these, PostgREST returns 403
-- and proof of work looks permanently empty.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on job_attachments to service_role;
grant select, insert, update, delete on job_attachments to authenticated;
grant select on job_attachments to anon;

grant select, insert, update, delete on job_signatures to service_role;
grant select, insert, update, delete on job_signatures to authenticated;
grant select on job_signatures to anon;

grant select, insert, update, delete on job_parts to service_role;
grant select, insert, update, delete on job_parts to authenticated;
grant select on job_parts to anon;

-- =====================================================================
-- 004: GST INVOICES, LINE ITEMS AND COMMUNICATION ATTRIBUTION
-- Source of truth: supabase/migrations/004-gst-invoices.sql
-- =====================================================================

-- Phase 4: GST invoices and customer communication history.
--
-- Three additions, all idempotent. Paste the whole block into Supabase ->
-- SQL Editor and press Run. No existing row is deleted.
--
-- The gap: `payments.invoice` is a text label like "INV-4821" that means
-- nothing and is generated by a random number in the browser. There is no
-- invoice, no line items, no tax, and no way to print or file one. For a
-- business collecting GST, a payment record is not an invoice.

-- ---------------------------------------------------------------------
-- Customer tax identity
-- ---------------------------------------------------------------------
-- Both nullable. An invoice for a walk-in customer with no GSTIN is a valid
-- B2C invoice, and requiring the field would mean refusing to bill someone for
-- a repair they actually had done.
alter table customers add column if not exists gstin text;
alter table customers add column if not exists state text;

-- A GSTIN is 15 characters: 2 digits of state code, then 10 alphanumeric, then
-- a literal Z, then a checksum character. Validated in the app too, but a
-- database constraint is what stops a bad number being written by the seed
-- scripts or the REST API directly.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_gstin_check') then
    alter table customers add constraint customers_gstin_check
      check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{10}Z[0-9A-Z]$');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------
-- Money is stored in paise as bigint. Not numeric-as-rupees, and not float:
-- GST is filed to the rupee and reconciled to the paise, and a float column
-- cannot promise that the sum of the lines equals the stated total.
create table if not exists invoices (
  id                text primary key,
  -- Human-facing sequential number, separate from the primary key so the key
  -- can stay a stable internal id while the number follows the legal series.
  number            text not null,
  -- Nullable: a proforma or a raised invoice can exist before anyone pays, and
  -- an AMC renewal invoice is raised months before its payment.
  payment_id        text,
  customer_id       text not null references customers (id) on delete cascade,
  amc_id            text,
  service_id        text,
  issued_on         date not null default current_date,
  due_on            date,
  -- Both states are recorded on the document rather than looked up at render
  -- time. An invoice printed today must still show today's rates and today's
  -- place of supply in a year, when both may have changed.
  supplier_state    text,
  place_of_supply   text,
  inter_state       boolean not null default false,
  tax_rate          numeric not null default 18,
  subtotal_paise    bigint not null default 0,
  discount_paise    bigint not null default 0,
  -- Exactly one of the two pairs is non-zero, decided by inter_state.
  cgst_paise        bigint not null default 0,
  sgst_paise        bigint not null default 0,
  igst_paise        bigint not null default 0,
  total_paise       bigint not null default 0,
  amount_paid_paise bigint not null default 0,
  notes             text,
  created_at        timestamptz not null default now(),
  -- An invoice that is arithmetically impossible is rejected at the database.
  constraint invoices_tax_not_both_check check (
    not (inter_state and (cgst_paise <> 0 or sgst_paise <> 0))
  ),
  constraint invoices_tax_not_neither_check check (
    not (not inter_state and igst_paise <> 0)
  ),
  constraint invoices_non_negative_check check (
    subtotal_paise >= 0 and discount_paise >= 0 and total_paise >= 0
    and cgst_paise >= 0 and sgst_paise >= 0 and igst_paise >= 0
    and amount_paid_paise >= 0
  )
);

-- The number is the legal identity, so it has to be unique. The id is not
-- trusted for this because it is generated as a timestamp, which two invoices
-- raised in the same millisecond would share.
create unique index if not exists invoices_number_uniq on invoices (number);
-- An invoice is looked up by its payment as often as by its number.
create index if not exists invoices_payment_idx on invoices (payment_id) where payment_id is not null;
create index if not exists invoices_customer_idx on invoices (customer_id, issued_on desc);

-- Sequential series, so a new invoice number is a single atomic statement
-- rather than "read the max, add one" from the browser, which double-books a
-- number the moment two people raise an invoice at once.
create sequence if not exists invoice_number_seq start 1;

-- ---------------------------------------------------------------------
-- Line items
-- ---------------------------------------------------------------------
-- HSN/SAC because a service invoice is not valid for GST without the Service
-- Accounting Code, and the client almost always asks for it.
create table if not exists invoice_lines (
  id                 text primary key,
  invoice_id         text not null references invoices (id) on delete cascade,
  position           integer not null default 0,
  description        text not null,
  hsn_sac            text,
  quantity           numeric not null default 1,
  unit_price_paise   bigint not null default 0,
  tax_rate           numeric not null default 18,
  line_total_paise   bigint not null default 0,
  created_at         timestamptz not null default now(),
  constraint invoice_lines_quantity_check check (quantity > 0),
  constraint invoice_lines_non_negative_check check (unit_price_paise >= 0 and line_total_paise >= 0)
);

create index if not exists invoice_lines_invoice_idx on invoice_lines (invoice_id, position);

-- ---------------------------------------------------------------------
-- Communication history
-- ---------------------------------------------------------------------
-- The gap: emails and calls are recorded, but neither knows which customer they
-- were about, so "what have we told this customer?" cannot be answered from
-- their profile. Nullable and backfilled below, because most existing rows can
-- be attributed by recipient address but calls only carry a display name.
alter table outbox_emails add column if not exists customer_id text;
alter table outbox_calls  add column if not exists customer_id text;

create index if not exists outbox_emails_customer_idx on outbox_emails (customer_id, sent_at desc) where customer_id is not null;
create index if not exists outbox_calls_customer_idx  on outbox_calls (customer_id, created_at desc) where customer_id is not null;

-- Emails are attributable by address, which is unique per customer. Case is
-- ignored because the address is compared exactly in the app and a row written
-- by the seed script as "Darshan@..." would otherwise not match.
update outbox_emails e
   set customer_id = c.id
  from customers c
 where e.customer_id is null
   and lower(trim(e.to_email)) = lower(trim(c.email));

-- Calls carry only `to_name`, and several technicians share display names, so
-- there is nothing here to join on. Left null deliberately rather than guessed
-- at a wrong customer: a communication history that confidently attributes a
-- call to the wrong account is worse than one that admits the gap.

-- ---------------------------------------------------------------------
-- Issuing an invoice
-- ---------------------------------------------------------------------
-- Two functions, because two separate client statements cannot write a header
-- and its lines atomically. If the line insert failed after the header
-- succeeded, the result is an invoice that totals something, has no lines, and
-- looks entirely legitimate — the kind of error nobody notices until an audit.
--
-- nextval is what makes the number safe under concurrency; the transaction is
-- what makes the document safe.
create or replace function public.next_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  n := nextval('public.invoice_number_seq');
  return 'INV-' || lpad(n::text, 6, '0');
end;
$$;

create or replace function public.create_invoice_with_lines(
  p_invoice jsonb,
  p_lines    jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  -- This function is security definer, so it runs as the table owner and
  -- ignores the RLS policies above entirely. The staff check therefore has to
  -- be repeated here by hand: without it, any authenticated customer could call
  -- this RPC and write an invoice against any customer id they liked.
  if not exists (
    select 1 from public.profiles p
    where p.auth_uid = auth.uid()
      and p.role = 'technician'
      and p.status = 'active'
  ) then
    raise exception 'only active staff may issue an invoice'
      using errcode = '42501';
  end if;

  -- The header.
  insert into public.invoices (
    id, number, payment_id, customer_id, amc_id, service_id, issued_on, due_on,
    supplier_state, place_of_supply, inter_state, tax_rate, subtotal_paise,
    discount_paise, cgst_paise, sgst_paise, igst_paise, total_paise,
    amount_paid_paise, notes, created_at
  )
  values (
    p_invoice->>'id',
    p_invoice->>'number',
    p_invoice->>'payment_id',
    p_invoice->>'customer_id',
    p_invoice->>'amc_id',
    p_invoice->>'service_id',
    (p_invoice->>'issued_on')::date,
    (p_invoice->>'due_on')::date,
    p_invoice->>'supplier_state',
    p_invoice->>'place_of_supply',
    coalesce((p_invoice->>'inter_state')::boolean, false),
    coalesce((p_invoice->>'tax_rate')::numeric, 18),
    coalesce((p_invoice->>'subtotal_paise')::bigint, 0),
    coalesce((p_invoice->>'discount_paise')::bigint, 0),
    coalesce((p_invoice->>'cgst_paise')::bigint, 0),
    coalesce((p_invoice->>'sgst_paise')::bigint, 0),
    coalesce((p_invoice->>'igst_paise')::bigint, 0),
    coalesce((p_invoice->>'total_paise')::bigint, 0),
    coalesce((p_invoice->>'amount_paid_paise')::bigint, 0),
    p_invoice->>'notes',
    coalesce((p_invoice->>'created_at')::timestamptz, now())
  );

  -- The lines, from the same jsonb array, position preserved.
  insert into public.invoice_lines (
    id, invoice_id, position, description, hsn_sac, quantity,
    unit_price_paise, tax_rate, line_total_paise
  )
  select
    l->>'id',
    p_invoice->>'id',
    coalesce((l->>'position')::integer, 0),
    l->>'description',
    l->>'hsn_sac',
    coalesce((l->>'quantity')::numeric, 1),
    coalesce((l->>'unit_price_paise')::bigint, 0),
    coalesce((l->>'tax_rate')::numeric, 18),
    coalesce((l->>'line_total_paise')::bigint, 0)
  from jsonb_array_elements(p_lines) as l
  where l->>'id' is not null and l->>'description' is not null;

  return gen_random_uuid();
exception
  when others then
    -- Reraise rather than swallow: a partially written invoice is exactly the
    -- failure this function exists to prevent, and hiding it would recreate the
    -- problem in a harder-to-diagnose form.
    raise;
end;
$$;

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
-- A table created through the SQL editor does not inherit the default
-- privileges the dashboard UI applies; without these PostgREST returns 403.
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on invoices to service_role;
grant select, insert, update, delete on invoices to authenticated;

grant select, insert, update, delete on invoice_lines to service_role;
grant select, insert, update, delete on invoice_lines to authenticated;

-- Deliberately NOT granted to anon.
--
-- The anon key is compiled into the browser bundle, so a grant to anon is a
-- grant to anybody who loads the page. An invoice carries a customer's legal
-- name, address, GSTIN and a full tax breakdown, and `invoices.number` is
-- sequential, so a readable table plus a predictable key range is enough to
-- page through the whole customer book. The other tables in this schema take
-- the same view: the blanket loop in schema.sql grants to `authenticated` only,
-- and `service_role` bypasses RLS for the back office.
--
-- Read access for the browser is therefore gated on a session, below.

alter table invoices     enable row level security;
alter table invoice_lines enable row level security;

-- A customer sees their own invoices; staff see all of them.
--
-- The customer half is expressed through profiles.customer_id rather than
-- through the email on the invoice, because the email is a mutable contact
-- detail and using it as an identity would let a customer who edits their own
-- address also read the invoices of whoever previously held it.
drop policy if exists "invoices_select_own_or_staff" on invoices;

create policy "invoices_select_own_or_staff" on invoices
  for select
  using (
    customer_id = (
      select p.customer_id from profiles p
      where p.auth_uid = auth.uid() and p.customer_id is not null
    )
    or exists (
      select 1 from profiles p
      where p.auth_uid = auth.uid() and p.role = 'technician' and p.status = 'active'
    )
  );

drop policy if exists "invoices_insert_staff" on invoices;

create policy "invoices_insert_staff" on invoices
  for insert
  with check (
    exists (
      select 1 from profiles p
      where p.auth_uid = auth.uid() and p.role = 'technician' and p.status = 'active'
    )
  );

drop policy if exists "invoices_update_staff" on invoices;

create policy "invoices_update_staff" on invoices
  for update
  using (
    exists (
      select 1 from profiles p
      where p.auth_uid = auth.uid() and p.role = 'technician' and p.status = 'active'
    )
  );

-- Lines follow their parent. Reaching the header is not enough: without this a
-- customer could read every line of every invoice by querying the child table
-- directly, even the ones the header policy hides.
drop policy if exists "invoice_lines_select_own_or_staff" on invoice_lines;

create policy "invoice_lines_select_own_or_staff" on invoice_lines
  for select
  using (
    exists (
      select 1 from invoices i
      where i.id = invoice_lines.invoice_id
        and (
          i.customer_id = (
            select p.customer_id from profiles p
            where p.auth_uid = auth.uid() and p.customer_id is not null
          )
          or exists (
            select 1 from profiles p
            where p.auth_uid = auth.uid() and p.role = 'technician' and p.status = 'active'
          )
        )
    )
  );

drop policy if exists "invoice_lines_write_staff" on invoice_lines;

create policy "invoice_lines_write_staff" on invoice_lines
  for all
  using (
    exists (
      select 1 from profiles p
      where p.auth_uid = auth.uid() and p.role = 'technician' and p.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.auth_uid = auth.uid() and p.role = 'technician' and p.status = 'active'
    )
  );

-- Sequences are separate privileges from the table, and an invoice number is
-- drawn from one. Without this, raising an invoice fails with permission
-- denied on sequence "invoice_number_seq".
grant usage, select on sequence invoice_number_seq to service_role, authenticated;

-- The two issuing functions. execute is a separate privilege from select, and a
-- security definer function that nobody can execute is just a stored procedure.
grant execute on function public.next_invoice_number() to service_role, authenticated;
grant execute on function public.create_invoice_with_lines(jsonb, jsonb) to service_role, authenticated;

-- =====================================================================
-- Phase 5: technician dispatch.
--
-- The body below is the same text as supabase/migrations/005-technician-dispatch.sql.
-- Keep the two in step: the migration is what gets pasted into the SQL editor,
-- this file is what describes the finished database.
-- =====================================================================

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

-- =====================================================================
-- Role-scoped row level security
-- Mirrors supabase/migrations/006-role-scoped-rls.sql. The blanket
-- "%s_all_authenticated" policies created above are dropped and
-- replaced here, so a fresh run of this file lands on the same
-- locked-down state as an existing database that has run migration 006.
-- =====================================================================
-- ---------------------------------------------------------------------------
-- 1. Role helpers
-- ---------------------------------------------------------------------------

drop function if exists public.is_admin();
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

drop function if exists public.is_active_technician();
create function public.is_active_technician()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.auth_uid = auth.uid()
      and p.role = 'technician'
      and p.status = 'active'
  );
$$;

-- Staff = admin, or an approved technician. Technicians legitimately read the
-- work queue (customers, assets, services, complaints) because they have to
-- travel to those addresses, but they do not get to rewrite customer master
-- data or touch billing.
drop function if exists public.is_staff();
create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin() or public.is_active_technician();
$$;

drop function if exists public.my_customer_id();
create function public.my_customer_id()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.customer_id
  from public.profiles p
  where p.auth_uid = auth.uid()
    and p.role = 'customer'
    and p.status = 'active'
    and p.customer_id is not null
  limit 1;
$$;

grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.is_active_technician() to anon, authenticated, service_role;
grant execute on function public.is_staff() to anon, authenticated, service_role;
grant execute on function public.my_customer_id() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. job_evidence tables: RLS was never enabled
-- ---------------------------------------------------------------------------

alter table public.job_parts      enable row level security;
alter table public.job_attachments enable row level security;
alter table public.job_signatures  enable row level security;

-- A technician on the job records parts, photos and the customer signature, so
-- staff write. A customer may read evidence only for their own services.
-- is_staff() / my_customer_id() short-circuit before the correlated subquery is
-- evaluated, so the common paths stay cheap.
drop policy if exists "job_evidence_select_staff_or_own" on public.job_attachments;
create policy "job_evidence_select_staff_or_own" on public.job_attachments
  for select
  using (
    public.is_staff()
    or exists (
      select 1 from public.services s
      where s.id = job_attachments.service_id
        and s.customer_id = public.my_customer_id()
    )
  );

drop policy if exists "job_evidence_write_staff" on public.job_attachments;
create policy "job_evidence_write_staff" on public.job_attachments
  for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "job_evidence_select_staff_or_own" on public.job_parts;
create policy "job_evidence_select_staff_or_own" on public.job_parts
  for select
  using (
    public.is_staff()
    or exists (
      select 1 from public.services s
      where s.id = job_parts.service_id
        and s.customer_id = public.my_customer_id()
    )
  );

drop policy if exists "job_evidence_write_staff" on public.job_parts;
create policy "job_evidence_write_staff" on public.job_parts
  for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "job_evidence_select_staff_or_own" on public.job_signatures;
create policy "job_evidence_select_staff_or_own" on public.job_signatures
  for select
  using (
    public.is_staff()
    or exists (
      select 1 from public.services s
      where s.id = job_signatures.service_id
        and s.customer_id = public.my_customer_id()
    )
  );

drop policy if exists "job_evidence_write_staff" on public.job_signatures;
create policy "job_evidence_write_staff" on public.job_signatures
  for all
  using (public.is_staff())
  with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 3. customers
-- ---------------------------------------------------------------------------

drop policy if exists "customers_all_authenticated" on public.customers;

drop policy if exists "customers_select_staff_or_own" on public.customers;
create policy "customers_select_staff_or_own" on public.customers
  for select
  using (public.is_staff() or id = public.my_customer_id());

drop policy if exists "customers_write_admin" on public.customers;
create policy "customers_write_admin" on public.customers
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. assets
-- ---------------------------------------------------------------------------

drop policy if exists "assets_all_authenticated" on public.assets;

drop policy if exists "assets_select_staff_or_own" on public.assets;
create policy "assets_select_staff_or_own" on public.assets
  for select
  using (public.is_staff() or customer_id = public.my_customer_id());

drop policy if exists "assets_write_admin" on public.assets;
create policy "assets_write_admin" on public.assets
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. amcs
-- ---------------------------------------------------------------------------

drop policy if exists "amcs_all_authenticated" on public.amcs;

drop policy if exists "amcs_select_staff_or_own" on public.amcs;
create policy "amcs_select_staff_or_own" on public.amcs
  for select
  using (public.is_staff() or customer_id = public.my_customer_id());

drop policy if exists "amcs_write_admin" on public.amcs;
create policy "amcs_write_admin" on public.amcs
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. services
-- ---------------------------------------------------------------------------

drop policy if exists "services_all_authenticated" on public.services;

drop policy if exists "services_select_staff_or_own" on public.services;
create policy "services_select_staff_or_own" on public.services
  for select
  using (public.is_staff() or customer_id = public.my_customer_id());

-- Technicians update status/rating on jobs they complete, so staff write.
drop policy if exists "services_write_staff" on public.services;
create policy "services_write_staff" on public.services
  for all
  using (public.is_staff())
  with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 7. complaints
--
-- Customers may raise a complaint against themselves and leave feedback, so
-- insert/update are allowed for a customer's own row. Deletion is admin-only.
-- ---------------------------------------------------------------------------

drop policy if exists "complaints_all_authenticated" on public.complaints;

drop policy if exists "complaints_select_staff_or_own" on public.complaints;
create policy "complaints_select_staff_or_own" on public.complaints
  for select
  using (public.is_staff() or customer_id = public.my_customer_id());

drop policy if exists "complaints_insert_own" on public.complaints;
create policy "complaints_insert_own" on public.complaints
  for insert
  with check (public.is_staff() or customer_id = public.my_customer_id());

drop policy if exists "complaints_update_staff_or_own" on public.complaints;
create policy "complaints_update_staff_or_own" on public.complaints
  for update
  using (public.is_staff() or customer_id = public.my_customer_id())
  with check (public.is_staff() or customer_id = public.my_customer_id());

drop policy if exists "complaints_delete_admin" on public.complaints;
create policy "complaints_delete_admin" on public.complaints
  for delete
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 8. complaint_messages
-- ---------------------------------------------------------------------------

drop policy if exists "complaint_messages_all_authenticated" on public.complaint_messages;

drop policy if exists "complaint_messages_select_staff_or_own" on public.complaint_messages;
create policy "complaint_messages_select_staff_or_own" on public.complaint_messages
  for select
  using (
    public.is_staff()
    or exists (
      select 1 from public.complaints c
      where c.id = complaint_messages.complaint_id
        and c.customer_id = public.my_customer_id()
    )
  );

drop policy if exists "complaint_messages_insert_staff_or_own" on public.complaint_messages;
create policy "complaint_messages_insert_staff_or_own" on public.complaint_messages
  for insert
  with check (
    public.is_staff()
    or exists (
      select 1 from public.complaints c
      where c.id = complaint_messages.complaint_id
        and c.customer_id = public.my_customer_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 9. payments
--
-- A customer settles an invoice through the pay_complete(...) RPC, which is
-- SECURITY DEFINER, so the portal does not need direct write access here.
-- ---------------------------------------------------------------------------

drop policy if exists "payments_all_authenticated" on public.payments;

drop policy if exists "payments_select_staff_or_own" on public.payments;
create policy "payments_select_staff_or_own" on public.payments
  for select
  using (public.is_staff() or customer_id = public.my_customer_id());

drop policy if exists "payments_write_admin" on public.payments;
create policy "payments_write_admin" on public.payments
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 10. notifications
-- ---------------------------------------------------------------------------

drop policy if exists "notifications_all_authenticated" on public.notifications;

drop policy if exists "notifications_select_staff_or_own" on public.notifications;
create policy "notifications_select_staff_or_own" on public.notifications
  for select
  using (public.is_staff() or customer_id = public.my_customer_id());

drop policy if exists "notifications_write_staff" on public.notifications;
create policy "notifications_write_staff" on public.notifications
  for all
  using (public.is_staff())
  with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 11. outbox_emails / outbox_calls
--
-- Internal communication logs. Staff read; admin writes.
-- ---------------------------------------------------------------------------

drop policy if exists "outbox_emails_all_authenticated" on public.outbox_emails;

drop policy if exists "outbox_emails_select_staff" on public.outbox_emails;
create policy "outbox_emails_select_staff" on public.outbox_emails
  for select
  using (public.is_staff());

drop policy if exists "outbox_emails_write_admin" on public.outbox_emails;
create policy "outbox_emails_write_admin" on public.outbox_emails
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "outbox_calls_all_authenticated" on public.outbox_calls;

drop policy if exists "outbox_calls_select_staff" on public.outbox_calls;
create policy "outbox_calls_select_staff" on public.outbox_calls
  for select
  using (public.is_staff());

drop policy if exists "outbox_calls_write_admin" on public.outbox_calls;
create policy "outbox_calls_write_admin" on public.outbox_calls
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 12. retention_actions
--
-- Internal churn analysis. Not customer-facing.
-- ---------------------------------------------------------------------------

drop policy if exists "retention_actions_all_authenticated" on public.retention_actions;

drop policy if exists "retention_actions_select_staff" on public.retention_actions;
create policy "retention_actions_select_staff" on public.retention_actions
  for select
  using (public.is_staff());

drop policy if exists "retention_actions_write_admin" on public.retention_actions;
create policy "retention_actions_write_admin" on public.retention_actions
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 13. profiles
--
-- Replaces the blanket update policy, which let any signed-in user edit any
-- profile — including promoting their own account.
-- ---------------------------------------------------------------------------

drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_update_authenticated" on public.profiles;
drop policy if exists "profiles_delete_authenticated" on public.profiles;

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert
  with check (auth_uid = auth.uid());

-- Own row, or the whole directory for staff (the dispatcher needs technician
-- names and skills to build the week board).
drop policy if exists "profiles_select_own_or_staff" on public.profiles;
create policy "profiles_select_own_or_staff" on public.profiles
  for select
  using (auth_uid = auth.uid() or public.is_staff());

-- Editing your own display fields is fine; the guard trigger below blocks
-- anyone but an admin from changing role, status or the entity links.
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles
  for update
  using (auth_uid = auth.uid() or public.is_admin())
  with check (auth_uid = auth.uid() or public.is_admin());

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles
  for delete
  using (public.is_admin());

-- Policy alone is not enough: a customer editing their own row could set
-- status = 'active' or role = 'technician' and promote themselves. This
-- trigger refuses those column changes outright.
drop function if exists public.guard_profile_privileges();
create function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The service role is used by the seed script and by the verification
  -- harness, and it bypasses RLS but still fires triggers.
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Self sign-up can never arrive pre-approved.
    new.status := 'pending';
    new.approved_at := null;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.auth_uid is distinct from old.auth_uid
     or new.customer_id is distinct from old.customer_id
     or new.technician_id is distinct from old.technician_id then
    raise exception 'Only an admin can change an account role, status or links.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
  before insert or update on public.profiles
  for each row
  execute function public.guard_profile_privileges();

-- ---------------------------------------------------------------------------
-- 14. storage.objects job-evidence bucket
--
-- The read policy had no role check at all, so anyone could list and download
-- the bucket. Staff only, or a customer whose own service the file belongs to.
-- ---------------------------------------------------------------------------

drop policy if exists "job_evidence_read" on storage.objects;
create policy "job_evidence_read" on storage.objects
  for select
  using (
    bucket_id = 'job-evidence'
    and auth.role() = 'authenticated'
    and (
      public.is_staff()
      or exists (
        select 1 from public.services s
        where s.id = (storage.foldername(name))[1]
          and s.customer_id = public.my_customer_id()
      )
    )
  );

drop policy if exists "job_evidence_write" on storage.objects;
create policy "job_evidence_write" on storage.objects
  for insert
  with check (bucket_id = 'job-evidence' and public.is_staff());

drop policy if exists "job_evidence_update" on storage.objects;
create policy "job_evidence_update" on storage.objects
  for update
  using (bucket_id = 'job-evidence' and public.is_staff())
  with check (bucket_id = 'job-evidence' and public.is_staff());

drop policy if exists "job_evidence_delete" on storage.objects;
create policy "job_evidence_delete" on storage.objects
  for delete
  using (bucket_id = 'job-evidence' and public.is_staff());

-- ---------------------------------------------------------------------------
-- 15. invoices / invoice_lines
--
-- These were already scoped, but only against a technician row in profiles.
-- Admins live in app_metadata, not profiles, so the admin account matched
-- neither branch and could not read or write invoices at all — invoicing was
-- effectively technician-only. Rewritten on the helpers so admin and approved
-- technicians both qualify, and so a pending technician does not.
-- ---------------------------------------------------------------------------

drop policy if exists "invoices_select_own_or_staff" on public.invoices;
create policy "invoices_select_own_or_staff" on public.invoices
  for select
  using (public.is_staff() or customer_id = public.my_customer_id());

drop policy if exists "invoices_insert_staff" on public.invoices;
create policy "invoices_insert_staff" on public.invoices
  for insert
  with check (public.is_staff());

drop policy if exists "invoices_update_staff" on public.invoices;
create policy "invoices_update_staff" on public.invoices
  for update
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "invoices_delete_admin" on public.invoices;
create policy "invoices_delete_admin" on public.invoices
  for delete
  using (public.is_admin());

drop policy if exists "invoice_lines_select_own_or_staff" on public.invoice_lines;
create policy "invoice_lines_select_own_or_staff" on public.invoice_lines
  for select
  using (
    public.is_staff()
    or exists (
      select 1 from public.invoices i
      where i.id = invoice_lines.invoice_id
        and i.customer_id = public.my_customer_id()
    )
  );

drop policy if exists "invoice_lines_write_staff" on public.invoice_lines;
create policy "invoice_lines_write_staff" on public.invoice_lines
  for all
  using (public.is_staff())
  with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 16. rls_report
--
-- A readable view over pg_policies so the verification harness can assert what
-- is actually installed in the database rather than trusting the file on disk.
-- Restricted to signed-in users; there is nothing sensitive in the policy list.
-- ---------------------------------------------------------------------------

drop view if exists public.rls_report;
create view public.rls_report as
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

grant select on public.rls_report to authenticated, service_role;
