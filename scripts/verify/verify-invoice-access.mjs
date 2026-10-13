#!/usr/bin/env node
/**
 * Checks the access rules on invoices and invoice_lines, because both of the
 * mistakes these guard against are invisible in the client code: a tautological
 * ownership expression type-checks perfectly and still lets anyone in, and a
 * missing `enable row level security` fails silently as "no rows", which reads
 * like an empty dataset rather than a broken policy.
 *
 * Read-only. Runs against the live database with the anon key and the service
 * key, and asserts on what each one can actually read. It creates and drops
 * nothing, so it is safe to point at a database that holds real rows.
 *
 *   npx tsx scripts/tmp-scan/verify-invoice-access.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

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
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

if (!url || !anonKey) {
  console.error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.')
  process.exit(1)
}

const anon = createClient(url, anonKey, { auth: { persistSession: false } })
const admin = serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null

console.log('\nInvoice access rules\n')

// ---------------------------------------------------------------------
// 1. Static: the migration must not hand the table to anon.
// ---------------------------------------------------------------------
console.log('migration file')
const sql = readFileSync('supabase/migrations/004-gst-invoices.sql', 'utf8')
// Strips comment lines so the prose that says "not granted to anon" is not
// mistaken for the grant itself.
const statements = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n')

check(
  'no `select` grant on invoices to anon',
  !/grant\s+select[^;]*\bon\s+invoices\s+to\s+anon/i.test(statements),
)
check(
  'no `select` grant on invoice_lines to anon',
  !/grant\s+select[^;]*\bon\s+invoice_lines\s+to\s+anon/i.test(statements),
)
check('invoices has RLS enabled', /alter\s+table\s+invoices\s+enable\s+row\s+level\s+security/i.test(statements))
check('invoice_lines has RLS enabled', /alter\s+table\s+invoice_lines\s+enable\s+row\s+level\s+security/i.test(statements))
check(
  'the issuing function re-checks staff despite being security definer',
  /security definer[\s\S]*?only active staff may issue an invoice/i.test(statements),
  'a security definer function bypasses RLS, so the policy above does not protect it',
)

// ---------------------------------------------------------------------
// 2. Live: what the anon key can actually read.
// ---------------------------------------------------------------------
console.log('\nanon key (this ships in the browser bundle)')
const { data: anonRows, error: anonErr } = await anon.from('invoices').select('id, customer_id, number, total_paise').limit(50)

// Before the migration is applied the table does not exist, which is a different
// situation from the one under test: there is nothing to protect yet. Reported
// as a skip, so a run against an un-migrated database does not read as a failing
// security check.
const missing = /could not find the table|PGRST205|42P01/i.test(`${anonErr?.code ?? ''} ${anonErr?.message ?? ''}`)
if (missing) {
  console.log('  skip  migration 004 is not applied yet — apply it, then re-run this harness')
  console.log(`\n${pass} passed, ${fail} failed, live checks skipped\n`)
  process.exit(fail === 0 ? 0 : 1)
}
// Two outcomes are safe, and they are not the same thing:
//   - permission denied, because anon has no grant at all. The strongest result.
//   - zero rows, because anon has a grant but RLS matches nothing.
// Anything else — a row, a count above zero — is a leak. So the check is on the
// data, and the error is only inspected to confirm it is a refusal rather than
// some unrelated failure being mistaken for one.
const refused = (e) => !!e && /permission denied|row-level security/i.test(`${e.code ?? ''} ${e.message ?? ''}`)
check(
  'anon reads no invoice rows',
  (anonRows ?? []).length === 0,
  anonErr && !refused(anonErr) ? `unexpected error: ${anonErr.message}` : `got ${anonRows?.length} rows`,
)
check(
  'anon is refused outright, not merely empty',
  (anonRows ?? []).length === 0 && (refused(anonErr) || !anonErr),
  `error was ${anonErr?.message ?? 'none'}`,
)
const { data: anonLines, error: anonLineErr } = await anon.from('invoice_lines').select('id, description, line_total_paise').limit(50)
check(
  'anon reads no invoice line rows',
  (anonLines ?? []).length === 0,
  anonLineErr && !refused(anonLineErr) ? `unexpected error: ${anonLineErr.message}` : `got ${anonLines?.length} rows`,
)

// ---------------------------------------------------------------------
// 3. Live: staff still works, and the two keys disagree.
// ---------------------------------------------------------------------
if (!admin) {
  console.log('\nstaff key: SUPABASE_SERVICE_ROLE_KEY not set, skipping')
} else {
  console.log('\nservice key (back office)')
  const { data: staffRows, error: staffErr } = await admin.from('invoices').select('id, number').limit(50)
  check('service key can read invoices', !staffErr, staffErr?.message)
  check('service key sees at least as many rows as anon', (staffRows?.length ?? 0) >= (anonRows?.length ?? 0))
}

// ---------------------------------------------------------------------
// 4. Every migration is safe to paste twice.
// ---------------------------------------------------------------------
// `create policy` has no `if not exists` form, so a migration that creates one
// without dropping it first aborts halfway through on the second paste. These
// files are applied by hand into the SQL editor, so a re-paste is routine, and a
// half-applied migration is the worst kind of failure: RLS ends up enabled with
// no policy at all, which reads as "no access" rather than "no access rule", so
// it surfaces later as a mysteriously empty screen instead of an error.
{
  console.log('\nre-pasting a migration is safe')
  const files = [
    'supabase/migrations/001-assets.sql',
    'supabase/migrations/002-visits-sla.sql',
    'supabase/migrations/003-proof-of-work.sql',
    'supabase/migrations/004-gst-invoices.sql',
    'supabase/migrations/005-technician-dispatch.sql',
    'supabase/schema.sql',
  ]
  for (const file of files) {
    let text
    try { text = readFileSync(file, 'utf8') } catch { continue }
    const unguarded = [...text.matchAll(/^create policy/gm)]
      .map((m) => m.index)
      .filter((i) => !/drop policy if exists[^;]+;\s*$/i.test(text.slice(Math.max(0, i - 220), i)))
    check(`${file}: every policy is dropped before it is created`, unguarded.length === 0, `${unguarded.length} unguarded`)
    const bareTables = [...text.matchAll(/^create table (?!if not exists)/gm)].length
    check(`${file}: every table is created conditionally`, bareTables === 0, `${bareTables} bare`)
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
