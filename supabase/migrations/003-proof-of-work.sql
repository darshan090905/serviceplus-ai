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
-- History: this bucket was originally public on purpose. The reasoning at the
-- time was that a private bucket costs reliability - every render awaits a
-- signed URL, images break the moment one expires, an upload cannot be echoed
-- back to the technician without a round trip - and that it bought little,
-- because at that point the table policies granted every authenticated user
-- read and write on every table. A locked door on an open room.
--
-- That second half stopped being true in 006, which scoped every policy to
-- staff-or-own-customer. The room is now locked down, so the door is the part
-- that is left, and it was guarding customer visit photos and the customer's
-- own signature on their own property. The first half is handled in the app
-- instead: loadEvidence() in src/services/jobService.ts mints all signed URLs
-- for a visit in one pass, and ProofOfWorkPanel re-signs once on an image load
-- error so an expired URL recovers without the user doing anything.
--
-- Stored storage_path values are unaffected by this change.
insert into storage.buckets (id, name, public)
values ('job-evidence', 'job-evidence', false)
on conflict (id) do update set public = false;

-- Superseded by 006, which drops and recreates this policy with a real access
-- check: authenticated, and staff or the customer whose own service the file
-- belongs to. The form below is left as it was originally written so this file
-- stays a faithful record of the phase, but it is NOT the live policy - it
-- grants every visitor read of the whole bucket, which only ever made sense
-- while the bucket was public anyway.
drop policy if exists "job_evidence_read" on storage.objects;
-- create policy has no "if not exists", so re-pasting this migration
-- aborts on the second run. Dropping first makes the file idempotent.
drop policy if exists "job_evidence_read" on storage;

create policy "job_evidence_read" on storage.objects for select
  using (bucket_id = 'job-evidence');

drop policy if exists "job_evidence_write" on storage.objects;
-- create policy has no "if not exists", so re-pasting this migration
-- aborts on the second run. Dropping first makes the file idempotent.
drop policy if exists "job_evidence_write" on storage;

create policy "job_evidence_write" on storage.objects for insert
  with check (bucket_id = 'job-evidence' and auth.role() = 'authenticated');

drop policy if exists "job_evidence_update" on storage.objects;
-- create policy has no "if not exists", so re-pasting this migration
-- aborts on the second run. Dropping first makes the file idempotent.
drop policy if exists "job_evidence_update" on storage;

create policy "job_evidence_update" on storage.objects for update
  using (bucket_id = 'job-evidence' and auth.role() = 'authenticated');

drop policy if exists "job_evidence_delete" on storage.objects;
-- create policy has no "if not exists", so re-pasting this migration
-- aborts on the second run. Dropping first makes the file idempotent.
drop policy if exists "job_evidence_delete" on storage;

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
