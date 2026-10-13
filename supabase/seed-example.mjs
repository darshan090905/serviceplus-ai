// Creates exactly one example AMC contract plus one retention action, so the
// AMC and retention screens have something to show after a full wipe — without
// ever sending an email.
//
//   node supabase/seed-example.mjs            -> dry run, prints what it would create
//   node supabase/seed-example.mjs --confirm  -> inserts it
//
// Two deliberate choices keep mail impossible:
//
//  1. The example contract's status is 'Expiring Soon', not 'Active'. The n8n
//     reminder workflow queries `amcs?status=eq.Active` and re-checks
//     `status === 'Active'` before queuing anything, so this contract can never
//     reach the outbox no matter how close its end date is.
//  2. The example customer's address uses the reserved .invalid TLD (RFC 2606),
//     which can never receive mail. Even a manual "send reminder" click can only
//     ever fail DNS resolution.
//
// There are no payments, complaints, notifications or outbox rows, so the
// overdue-payment and outbox workflows have nothing to pick up either.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'

const CONFIRM = process.argv.includes('--confirm')
const CUSTOMER_ID = 'C-EXAMPLE-1'
const AMC_ID = 'AMC-EXAMPLE-1'
const RETENTION_ID = 'RET-EXAMPLE-1'

// Local-date formatter. Plain `toISOString()` converts to UTC, so local midnight
// on the 1st of a month is still the previous day in any timezone east of UTC
// (IST is +5:30) — which is how "1 January 2026" got seeded as 2025-12-31.
const localDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const shift = (days) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return localDate(d)
}
const monthStartOf = (offset) => {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  return localDate(d)
}

const customer = {
  id: CUSTOMER_ID,
  name: 'Example Customer',
  company: 'Example Company',
  email: 'no-reply@example.invalid',
  phone: '+91 90000 00000',
  address: 'Example Street 1',
  city: 'Bengaluru',
  type: 'Business',
  service_types: ['AC Service'],
  joined: monthStartOf(-8),
  factors: [
    { label: 'Contract expiring soon', points: -18 },
    { label: 'No recent complaint', points: 4 },
    { label: 'Payments on time', points: 6 },
  ],
}

const amc = {
  id: AMC_ID,
  customer_id: CUSTOMER_ID,
  service_type: 'AC Service',
  start_date: monthStartOf(-8),
  end_date: shift(18),
  amount: 24000,
  // Not 'Active' on purpose — this is what stops the n8n reminder workflow.
  status: 'Expiring Soon',
  renewal_status: 'Pending',
}

const retention = {
  id: RETENTION_ID,
  customer_id: CUSTOMER_ID,
  primary_risk: 'Service Quality',
  recommended_action: 'Call the customer and offer the annual renewal before expiry',
  steps: [
    'Call within 3 days of the expiry date',
    'Quote the annual renewal with the loyalty discount',
    'If accepted, create the renewal AMC and mark this action Completed',
  ],
  reason: 'Contract expires in under 30 days and the renewal has not been started yet.',
  priority: 2,
  status: 'Pending',
  owner: 'Service Operations',
  revenue_at_risk: 24000,
  requires_approval: true,
  renewal_offer: {
    title: 'Annual renewal — 10% loyalty discount',
    discountPercent: 10,
    benefits: ['Priority complaint handling', 'Free annual health check', 'Same engineer on every visit'],
  },
}

function loadEnv() {
  const env = {}
  const file = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : ''
  for (const line of file.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/)
    if (match) env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
  return env
}

const env = loadEnv()
const SUPABASE_URL = env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (add to .env.local).')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

async function hasRenewalDateColumn() {
  const { error } = await sb.from('amcs').select('renewal_date').limit(1)
  return !error
}

async function main() {
  const withRenewalDate = await hasRenewalDateColumn()
  const amcRow = withRenewalDate ? { ...amc, renewal_date: shift(5) } : amc

  console.log('\nEXAMPLE — one customer, one AMC, one retention action')
  console.log(`  customer  ${customer.id}  ${customer.name} <${customer.email}>`)
  console.log(`  amc       ${amc.id}  ${amc.start_date} -> ${amc.end_date}  ${amc.status} / ${amc.renewal_status}  INR ${amc.amount}`)
  console.log(`  retention ${retention.id}  ${retention.status}  "${retention.recommended_action}"`)
  console.log(`\n  mail safety: status is not 'Active', so the n8n reminder workflow skips it.`)
  console.log(`  mail safety: ${customer.email} uses the reserved .invalid TLD — undeliverable by design.`)
  if (!withRenewalDate) {
    console.log(`\n  note: amcs.renewal_date is not in the database yet, so the renewal date is skipped.`)
    console.log(`        Apply: alter table amcs add column if not exists renewal_date date;`)
  }

  if (!CONFIRM) {
    console.log('\nDry run only. Re-run with --confirm to insert.')
    return
  }

  // Idempotent: replace any previous copy of the example rows.
  for (const [table, id] of [['retention_actions', RETENTION_ID], ['amcs', AMC_ID], ['customers', CUSTOMER_ID]]) {
    const { error } = await sb.from(table).delete().eq('id', id)
    if (error) throw new Error(`${table}: ${error.message}`)
  }

  const steps = [
    ['customers', customer],
    ['amcs', amcRow],
    ['retention_actions', retention],
  ]
  for (const [table, row] of steps) {
    const { error } = await sb.from(table).upsert(row, { onConflict: 'id' })
    if (error) throw new Error(`${table}: ${error.message}`)
    console.log(`  inserted ${table}/${row.id}`)
  }

  console.log('\nDone. Reload the app: AMC Contracts and Retention each show one example row.')
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
