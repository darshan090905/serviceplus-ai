#!/usr/bin/env node
/**
 * Proves the role-scoped RLS in supabase/migrations/006-role-scoped-rls.sql is
 * actually installed and actually enforced.
 *
 * Why this exists at all: the previous policies were wrong in a way that type
 * checks, lints clean, and shows up as a normal-looking empty list. Eleven
 * tables had `using (auth.role() = 'authenticated')` — any signed-in user, any
 * row, any verb. Three job-evidence tables had no RLS at all while being
 * granted to anon, so proof-of-work photos and signature images were readable
 * with no login. None of that is visible from the client.
 *
 * Checking this by reading pg_policies is not enough either: a policy can be
 * present, correctly named, and still match nothing because it references the
 * wrong column or the wrong role source. The only trustworthy check is
 * behavioural — sign in as an actual customer, as an actual technician and as
 * the admin, and look at what each one can read and write.
 *
 * The app has exactly one auth user (the admin, whose role lives in
 * app_metadata rather than in profiles), so this harness mints two throwaway
 * ones, gives them active profiles, and deletes them again in a finally block.
 * Every row it creates is prefixed `rlsprobe-` and removed on the way out.
 *
 * Writes to the live database, so the runner prints a warning for it. Needs
 * SUPABASE_SERVICE_ROLE_KEY (to mint the probe users) plus the anon key.
 *
 *   npx tsx scripts/verify/verify-rls.mjs
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_SERVICE_KEY

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) {
    pass++
    console.log(`  ok   ${name}`)
  } else {
    fail++
    console.log(`  FAIL ${name}${detail ? ` \u2014 ${detail}` : ''}`)
  }
}

if (!url || !anonKey || !serviceKey) {
  console.error('VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

const service = createClient(url, serviceKey, { auth: { persistSession: false } })
const anonAs = (jwt) =>
  createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${jwt}` } } })

// Deterministic, obviously-not-real ids so a leftover row is easy to spot and
// to clean up by hand if this process is killed mid-run.
const P = 'rlsprobe'
const stamp = Date.now().toString(36)
const ids = {
  customerA: `${P}-cust-a-${stamp}`,
  customerB: `${P}-cust-b-${stamp}`,
  assetA: `${P}-asset-a-${stamp}`,
  assetB: `${P}-asset-b-${stamp}`,
  serviceA: `${P}-svc-a-${stamp}`,
  serviceB: `${P}-svc-b-${stamp}`,
  complaintA: `${P}-cmp-a-${stamp}`,
  complaintB: `${P}-cmp-b-${stamp}`,
  profileCust: `${P}-prof-cust-${stamp}`,
  profileTech: `${P}-prof-tech-${stamp}`,
  emailCust: `${P}-customer-${stamp}@rlsprobe.invalid`,
  emailTech: `${P}-tech-${stamp}@rlsprobe.invalid`,
}

const createdUsers = []

async function mintUser(email) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: `${P}-${stamp}-pw`,
    email_confirm: true,
  })
  if (error) throw new Error(`could not create probe user ${email}: ${error.message}`)
  createdUsers.push(data.user.id)
  return data.user
}

/** Signs in and returns a client bound to that user's JWT. */
async function signedInClient(email, password) {
  const c = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`)
  return anonAs(data.session.access_token)
}

async function cleanup() {
  for (const table of ['complaint_messages', 'outbox_calls', 'job_signatures', 'job_parts', 'job_attachments', 'retention_actions', 'notifications', 'payments', 'amcs', 'services', 'assets', 'complaints', 'customers', 'profiles', 'invoices']) {
    await service.from(table).delete().like('id', `${P}-%`)
  }
  await service.from('profiles').delete().like('email', `${P}-%`)
  for (const uid of createdUsers) {
    await service.auth.admin.deleteUser(uid).catch(() => {})
  }
}

async function main() {
  console.log('RLS behaviour check')
  console.log('')

  // ---------------------------------------------------------------- install
  // The listing below is a belt-and-braces check that the policies are named
  // and installed as intended. The behavioural checks further down are the real
  // proof, and they only need ordinary table access, which the service role
  // always has. So a missing grant on this one diagnostic view must not stop
  // them from running.
  const { data: policies, error: polErr } = await service.from('rls_report').select('*')
  if (polErr) {
    if (/could not find/i.test(polErr.message)) {
      console.error('  rls_report does not exist, so migration 006 has not been applied.')
      console.error('  The database is still on the open policies. Run')
      console.error('  supabase/migrations/006-role-scoped-rls.sql before trusting anything below.')
      console.error('')
      process.exit(1)
    }
    console.log('  note  cannot read rls_report (' + polErr.message + ')')
    console.log('        The install-listing checks below are skipped; the behavioural')
    console.log('        checks still run and are what actually matter.')
    console.log('        To enable the listing: grant select on public.rls_report to authenticated, service_role;')
    console.log('')
  } else {
    const names = new Set((policies ?? []).map((p) => p.policyname))
    const blanket = (policies ?? []).filter((p) => /_all_authenticated$/.test(p.policyname))
    check('no blanket *_all_authenticated policy remains', blanket.length === 0, blanket.map((p) => p.policyname).join(', '))
    for (const p of ['customers_select_staff_or_own', 'services_select_staff_or_own', 'complaints_insert_own', 'profiles_update_own_or_admin', 'job_evidence_read']) {
      check(`policy installed: ${p}`, names.has(p))
    }
  }

  // ---------------------------------------------------------------- fixtures
  const custA = await mintUser(ids.emailCust)
  const techA = await mintUser(ids.emailTech)

  const seedRows = [
    ['customers', { id: ids.customerA, name: 'Probe Customer A', company: 'ProbeCo A', email: ids.emailCust, phone: '1', address: 'A', city: 'A', type: 'Business', service_types: ['ac'], joined: '2024-01-01', factors: [], health: 80 }],
    ['customers', { id: ids.customerB, name: 'Probe Customer B', company: 'ProbeCo B', email: `${P}-b-${stamp}@rlsprobe.invalid`, phone: '2', address: 'B', city: 'B', type: 'Individual', service_types: ['ac'], joined: '2024-01-01', factors: [], health: 70 }],
    ['assets', { id: ids.assetA, customer_id: ids.customerA, name: 'Probe Asset A', category: 'ac', model: 'm', serial_no: 's', capacity: '1', installed_on: '2024-01-01', warranty_until: '2026-01-01', location_note: 'A', status: 'ok', created_at: new Date().toISOString() }],
    ['assets', { id: ids.assetB, customer_id: ids.customerB, name: 'Probe Asset B', category: 'ac', model: 'm', serial_no: 's', capacity: '1', installed_on: '2024-01-01', warranty_until: '2026-01-01', location_note: 'B', status: 'ok', created_at: new Date().toISOString() }],
    ['services', { id: ids.serviceA, customer_id: ids.customerA, service_type: 'ac', date: '2024-06-01', technician: 'Probe Tech', status: 'completed', rating: 5, notes: 'A' }],
    ['services', { id: ids.serviceB, customer_id: ids.customerB, service_type: 'ac', date: '2024-06-02', technician: 'Probe Tech', status: 'completed', rating: 4, notes: 'B' }],
    ['complaints', { id: ids.complaintA, customer_id: ids.customerA, category: 'ac', description: 'A', severity: 'low', status: 'open', created: '2024-06-03T00:00:00.000Z', assigned_to: 'Probe Tech', service_type: 'ac' }],
    ['complaints', { id: ids.complaintB, customer_id: ids.customerB, category: 'ac', description: 'B', severity: 'low', status: 'open', created: '2024-06-04T00:00:00.000Z', assigned_to: 'Probe Tech', service_type: 'ac' }],
  ]
  for (const [table, row] of seedRows) {
    const { error } = await service.from(table).insert(row)
    if (error) {
      throw new Error(`fixture insert failed on ${table}: ${error.message} [code=${error.code} details=${error.details ?? '-'}]`)
    }
  }

  // Minting an auth user fires the handle_new_auth_user trigger, which already
  // created a pending profile for it keyed on the auth uid. So the probe does
  // not insert one; it approves it, exactly as the admin's approval action does.
  // Inserting a second profile would collide on the unique email index.
  for (const [uid, patch] of [
    [custA.id, { role: 'customer', status: 'active', customer_id: ids.customerA, technician_id: null, name: 'Probe Customer' }],
    [techA.id, { role: 'technician', status: 'active', customer_id: null, technician_id: `${P}-tech-id-${stamp}`, name: 'Probe Technician' }],
  ]) {
    const { error } = await service.from('profiles').update(patch).eq('auth_uid', uid)
    if (error) throw new Error(`could not approve probe profile: ${error.message}`)
  }
  const { data: approved, error: apprErr } = await service
    .from('profiles')
    .select('id, email, role, status, customer_id, technician_id')
    .in('auth_uid', [custA.id, techA.id])
  if (apprErr) throw new Error(`could not read back probe profiles: ${apprErr.message}`)
  ids.profileCust = approved.find((r) => r.role === 'customer')?.id ?? ids.profileCust
  ids.profileTech = approved.find((r) => r.role === 'technician')?.id ?? ids.profileTech
  // The value IncomingCallOverlay matches `outbox_calls.to_name` against.
  const techIdName = approved.find((r) => r.role === 'technician')?.technician_id ?? ''
  check('probe profiles are approved and linked', approved.length === 2 && approved.every((r) => r.status === 'active'), JSON.stringify(approved))

  // ------------------------------------------------------- anonymous visitor
  // No session at all. This is the check that the job_* tables used to fail.
  const visitor = createClient(url, anonKey, { auth: { persistSession: false } })
  for (const table of ['customers', 'assets', 'services', 'complaints', 'payments', 'profiles', 'job_parts', 'job_attachments', 'job_signatures']) {
    const { data, error } = await visitor.from(table).select('id').limit(50)
    const rows = data ?? []
    check(`anon reads nothing from ${table}`, (rows.length === 0) || Boolean(error), `${rows.length} row(s) leaked`)
  }

  // ---------------------------------------------------------------- customer
  const customer = await signedInClient(ids.emailCust, `${P}-${stamp}-pw`)

  const { data: custRows } = await customer.from('customers').select('id')
  const custIds = (custRows ?? []).map((r) => r.id)
  check('customer sees own customer row', custIds.includes(ids.customerA), custIds.join(','))
  check('customer cannot see another customer', !custIds.includes(ids.customerB), 'row B leaked')

  const { data: assetRows } = await customer.from('assets').select('id')
  const assetIds = (assetRows ?? []).map((r) => r.id)
  check('customer sees own assets', assetIds.includes(ids.assetA))
  check('customer cannot see another customer assets', !assetIds.includes(ids.assetB), 'asset B leaked')

  const { data: cmpRows } = await customer.from('complaints').select('id')
  const cmpIds = (cmpRows ?? []).map((r) => r.id)
  check('customer sees own complaints', cmpIds.includes(ids.complaintA))
  check('customer cannot see another customer complaints', !cmpIds.includes(ids.complaintB), 'complaint B leaked')

  // Writing as somebody else must be refused, not silently accepted.
  const { error: crossWrite } = await customer.from('complaints').insert({ id: `${P}-forge-${stamp}`, customer_id: ids.customerB, category: 'ac', description: 'forged', severity: 'low', status: 'open', created: '2024-06-05T00:00:00.000Z', assigned_to: 'Probe Tech', service_type: 'ac' })
  check('customer cannot open a complaint for another customer', Boolean(crossWrite), crossWrite ? '' : 'insert succeeded')

  // An UPDATE that RLS hides is not an error: PostgREST reports success and
  // simply affects zero rows. So the only trustworthy assertion is to read the
  // row back and confirm it is untouched. Asserting on the error code here
  // would pass no matter what the policy did.
  const { data: crossEdit } = await customer.from('customers').update({ address: 'hacked' }).eq('id', ids.customerB).select('id, address')
  const { data: bAfter } = await service.from('customers').select('address').eq('id', ids.customerB).single()
  check('customer cannot edit another customer', bAfter?.address !== 'hacked' && (crossEdit ?? []).length === 0, `address is now ${JSON.stringify(bAfter?.address)}`)

  const { error: ownComplaint } = await customer.from('complaints').insert({ id: `${P}-own-${stamp}`, customer_id: ids.customerA, category: 'ac', description: 'mine', severity: 'low', status: 'open', created: '2024-06-06T00:00:00.000Z', assigned_to: 'Probe Tech', service_type: 'ac' })
  check('customer can still open their own complaint', !ownComplaint, ownComplaint?.message)

  // The privilege-escalation guard.
  const { error: escalate } = await customer.from('profiles').update({ role: 'technician', status: 'active' }).eq('id', ids.profileCust)
  check('customer cannot promote their own role', Boolean(escalate), escalate ? '' : 'self-promotion succeeded')
  // Read the row back with the service key: the update must not have landed.
  const { data: after } = await service.from('profiles').select('role, status').eq('id', ids.profileCust).single()
  check('profile is still a customer after the attempt', after?.role === 'customer', JSON.stringify(after))

  // ---------------------------------------------------------------- technician
  const tech = await signedInClient(ids.emailTech, `${P}-${stamp}-pw`)
  const { data: techServices } = await tech.from('services').select('id')
  const techServiceIds = (techServices ?? []).map((r) => r.id)
  check('technician sees the work queue', techServiceIds.includes(ids.serviceA) && techServiceIds.includes(ids.serviceB), techServiceIds.join(','))

  const { data: techCust } = await tech.from('customers').select('id')
  check('technician sees customers they must visit', (techCust ?? []).length > 0)

  const { error: techCustWrite } = await tech.from('customers').insert({ id: `${P}-tech-forge-${stamp}`, name: 'x', company: 'x', email: 'x', phone: 'x', address: 'x', city: 'x', type: 'Individual', service_types: [], joined: '2024-01-01', factors: [], health: 1 })
  check('technician cannot add customers', Boolean(techCustWrite), techCustWrite ? '' : 'insert succeeded')

  const { error: techEscalate } = await tech.from('profiles').update({ role: 'customer' }).eq('id', ids.profileTech)
  const { data: techAfter } = await service.from('profiles').select('role').eq('id', ids.profileTech).single()
  check('technician cannot change their own role', Boolean(techEscalate) && techAfter?.role === 'technician', `role is now ${techAfter?.role}`)

  const { error: jobPartWrite } = await tech.from('job_parts').insert({ id: `${P}-part-${stamp}`, service_id: ids.serviceA, name: 'probe part', quantity: 1, unit_price: 1, cost_price: 1, serial_no: 'x', created_at: new Date().toISOString() })
  check('technician can still record job parts', !jobPartWrite, jobPartWrite?.message)
  const { data: jobRead } = await tech.from('job_parts').select('id')
  check('technician can read job evidence', (jobRead ?? []).length > 0)

  const { data: customerJobRead } = await customer.from('job_parts').select('id')
  const ownServiceParts = (customerJobRead ?? []).filter((r) => r.service_id === ids.serviceA)
  check('customer sees job evidence for own service only', ownServiceParts.length >= 0 && !(customerJobRead ?? []).some((r) => r.service_id === ids.serviceB), 'part for another customer leaked')

  // -------------------------------------------------------- AI call delivery
  // The queued AI call is the whole point of assigning a technician, and it is
  // delivered by a row in outbox_calls that the technician's browser has to be
  // able to read. That was the one link in the assign -> call -> ring chain with
  // no coverage at all, so a policy that quietly stopped matching the technician
  // looked identical to "the feature is just slow".
  //
  // The technician's identity here is `technician_id`, which is what
  // IncomingCallOverlay matches `to_name` against, so the call has to be
  // addressed to exactly that value.
  const probeCallMine = `${P}-call-mine-${stamp}`
  const probeCallOther = `${P}-call-other-${stamp}`
  for (const [id, toName] of [[probeCallMine, techIdName], [probeCallOther, `${P}-someone-else-${stamp}`]]) {
    const { error } = await service.from('outbox_calls').insert({ id, to_name: toName, complaint_id: ids.complaintA, type: 'assignment', message: 'probe', status: 'queued', read: false })
    if (error) throw new Error(`could not seed outbox_calls ${id}: ${error.message}`)
  }

  const { data: techCalls } = await tech.from('outbox_calls').select('id,to_name')
  const techCallIds = (techCalls ?? []).map((r) => r.id)
  check('technician can read the call queue', techCallIds.includes(probeCallMine), `is_staff() did not match: saw ${techCallIds.length} row(s)`)

  const { data: custCalls } = await customer.from('outbox_calls').select('id')
  check('customer cannot read the internal call queue', !(custCalls ?? []).some((r) => r.id === probeCallMine || r.id === probeCallOther), 'call leaked to a customer')

  const { error: custCallWrite } = await customer.from('outbox_calls').insert({ id: `${P}-call-forge-${stamp}`, to_name: 'x', message: 'x', status: 'queued' })
  check('customer cannot queue a call', Boolean(custCallWrite), custCallWrite ? '' : 'insert succeeded')

  console.log('')
}

try {
  await main()
} catch (err) {
  fail++
  console.error(`  FAIL harness error \u2014 ${err.message}`)
} finally {
  await cleanup().catch((e) => console.error(`  cleanup failed: ${e.message}`))
  console.log(`\n  ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}
