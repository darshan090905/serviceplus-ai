-- ---------------------------------------------------------------------------
-- 006-role-scoped-rls.sql
--
-- Replaces the demo-grade access model with role-scoped row level security.
--
-- Before this migration, eleven tables carried a single blanket policy,
-- "%s_all_authenticated", defined as:
--
--     using (auth.role() = 'authenticated')
--
-- which grants EVERY signed-in user full read AND write on every row. The
-- customer portal and the technician portal share the same anon key, so any
-- customer account could read every other customer's address, GSTIN, invoices,
-- complaints and retention notes, and could rewrite any of it. Two further
-- gaps:
--
--   * job_parts, job_attachments and job_signatures never had RLS enabled at
--     all, while still being granted to anon — so proof-of-work photos and
--     customer signature images were readable with no login whatsoever.
--   * profiles had a blanket update policy, so any signed-in user could set
--     their own role to 'technician' or flip their status to 'active'. That is
--     a straightforward privilege escalation, not a data leak.
--
-- The role model:
--   * admins are NOT in the profiles table (its check constraint allows only
--     'customer' and 'technician'). They are identified by
--     app_metadata.role = 'admin' in the auth JWT.
--   * customers and technicians are in profiles, joined by auth_uid, and are
--     only trusted once status = 'active'.
--
-- Helper functions are SECURITY DEFINER so that the profiles lookup inside
-- them does not recurse back into the profiles policies that call them.
--
-- Safe to run more than once. Replace migrations 001-004 need not be re-run.
-- ---------------------------------------------------------------------------

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
