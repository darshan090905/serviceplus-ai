// One-time cleanup of demo/test rows from the live ServicePulse database.
//
//   node supabase/purge-demo-data.mjs            -> dry run, prints exactly what goes
//   node supabase/purge-demo-data.mjs --confirm  -> writes a JSON backup, then deletes
//
// Everything is removed: every customer, AMC contract, service, complaint,
// complaint message, payment, retention action, notification and outbox row, plus
// every sign-in profile and every auth user except the admin. The website comes
// up completely empty, ready for real data.
//
// The admin keeps working with no profile row at all: sign-in falls back to
// auth.users.app_metadata.role = 'admin' (see the login path in AppStore).
//
// IMPORTANT: close every browser tab before running --confirm. The app upserts its
// in-memory customers/payments/retention rows on every state change, so an open
// tab holding stale data would write it straight back.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'

// The only identity allowed to survive. Everything else — profiles and auth
// users alike — is removed.
const KEEP_EMAILS = [
  'darshan.sirpi@gmail.com',
]

// Children first: complaints cascade complaint_messages, and customers cascade
// amcs/services/payments/retention_actions. assets has to go before customers —
// its customer_id is a bare text column with no foreign key, so nothing cascades
// it and it would survive as orphans.
const WIPED_TABLES = [
  'complaint_messages',
  'outbox_calls',
  'outbox_emails',
  'notifications',
  'complaints',
  'payments',
  'retention_actions',
  'services',
  'amcs',
  'assets',
]

const CONFIRM = process.argv.includes('--confirm')

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
const keepEmails = new Set(KEEP_EMAILS.map((e) => e.toLowerCase()))

const chunk = (rows, size = 200) => {
  const out = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

async function selectAll(table) {
  const { data, error } = await sb.from(table).select('*')
  if (error) throw new Error(`${table}: ${error.message}`)
  return data ?? []
}

async function deleteIds(table, ids) {
  let deleted = 0
  for (const group of chunk(ids)) {
    const { data, error } = await sb.from(table).delete().in('id', group).select('id')
    if (error) throw new Error(`${table}: ${error.message}`)
    deleted += data?.length ?? 0
  }
  return deleted
}

async function main() {
  const profiles = await selectAll('profiles')
  const customers = await selectAll('customers')

  const keepProfiles = profiles.filter((p) => keepEmails.has((p.email ?? '').toLowerCase()))
  const doomedProfiles = profiles.filter((p) => !keepEmails.has((p.email ?? '').toLowerCase()))

  // Nothing but the admin survives, so no customer record is protected. Every
  // customer goes, which cascades to their amcs/services/payments/retention rows
  // anyway — those tables are wiped first so the counts read cleanly.
  const keepCustomerIds = new Set(
    keepProfiles.map((p) => p.customer_id).filter((id) => typeof id === 'string' && id.length > 0),
  )
  const doomedCustomers = customers.filter((c) => !keepCustomerIds.has(c.id))

  const { data: authData, error: authError } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (authError) throw authError
  const doomedAuth = (authData?.users ?? []).filter((u) => !keepEmails.has((u.email ?? '').toLowerCase()))

  console.log('\nKEEP — the admin login only')
  console.log(`  ${'admin'.padEnd(6)} auth user ${[...keepEmails].join(', ')} (no profile row needed)`)
  if (keepProfiles.length) for (const p of keepProfiles) console.log(`  ${p.id.padEnd(6)} ${p.role.padEnd(10)} ${p.email}`)

  console.log('\nKEEP — customer records those profiles need')
  if (keepCustomerIds.size === 0) console.log('  (none — the whole customer list is removed)')
  for (const id of keepCustomerIds) {
    const c = customers.find((x) => x.id === id)
    console.log(`  ${id.padEnd(6)} ${c ? `${c.name} — ${c.email}` : '(missing)'}`)
  }

  console.log('\nDELETE')
  const wiped = {}
  for (const table of WIPED_TABLES) {
    wiped[table] = await selectAll(table)
    console.log(`  ${table.padEnd(20)} ${String(wiped[table].length).padStart(4)} rows`)
  }
  console.log(`  ${'customers'.padEnd(20)} ${String(doomedCustomers.length).padStart(4)} rows  (${customers.length} total, ${keepCustomerIds.size} kept)`)
  for (const c of doomedCustomers) console.log(`      would delete customer ${c.id} — ${c.name} <${c.email}>`)
  console.log(`  ${'profiles'.padEnd(20)} ${String(doomedProfiles.length).padStart(4)} rows  (${profiles.length} total, ${keepProfiles.length} kept)`)
  console.log(`  ${'auth users'.padEnd(20)} ${String(doomedAuth.length).padStart(4)} rows  (${authData?.users?.length ?? 0} total)`)
  for (const u of doomedAuth) console.log(`      would delete auth user ${u.email}`)

  if (!CONFIRM) {
    console.log('\nDry run only. Re-run with --confirm to delete (a JSON backup is written first).')
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `supabase/purge-backup-${stamp}.json`
  const backup = {
    createdAt: new Date().toISOString(),
    supabaseUrl: SUPABASE_URL,
    keptEmails: KEEP_EMAILS,
    keptProfiles: keepProfiles,
    keptCustomerIds: [...keepCustomerIds],
    tables: {
      ...Object.fromEntries(WIPED_TABLES.map((t) => [t, wiped[t]])),
      customers: doomedCustomers,
      profiles: doomedProfiles,
    },
    authUsers: doomedAuth.map((u) => ({ id: u.id, email: u.email })),
  }
  writeFileSync(backupPath, JSON.stringify(backup, null, 2))
  console.log(`\nBackup written to ${backupPath}`)

  console.log('\nDeleting…')
  for (const table of WIPED_TABLES) {
    const n = await deleteIds(table, wiped[table].map((r) => r.id))
    console.log(`  deleted ${n} from ${table}`)
  }
  const c = await deleteIds('customers', doomedCustomers.map((r) => r.id))
  console.log(`  deleted ${c} from customers`)
  const p = await deleteIds('profiles', doomedProfiles.map((r) => r.id))
  console.log(`  deleted ${p} from profiles`)

  for (const u of doomedAuth) {
    const { error } = await sb.auth.admin.deleteUser(u.id)
    if (error) console.error(`  FAIL auth user ${u.email}: ${error.message}`)
    else console.log(`  deleted auth user ${u.email}`)
  }

  console.log('\nDone. Reload the app to pick up the clean state.')
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
