/**
 * Seeds a week of dispatch-board demo data.
 *
 * The dispatch board is a week grid: days across, technicians down, and one
 * block per visit placed by its scheduled start time. With no `services` rows
 * at all it renders an empty state, which tells a first-time viewer nothing
 * about what the board is for. This writes visits for the current week so the
 * board can be understood before any real work is scheduled.
 *
 * Deliberately includes the three cases the board actually has to communicate:
 *   - a normal day of back-to-back visits,
 *   - two visits for one technician that overlap, which is what the conflict
 *     highlighting exists to catch,
 *   - a visit with no start time, which is *not* a 12:00 am job and is parked
 *     as unscheduled instead of being silently placed at midnight.
 *
 * Everything it writes is prefixed `SVC-DEMO-` and the demo technician profile
 * is prefixed `DEMO-`, so `--remove` can take all of it back out without
 * touching real data. The demo technician has no auth account, so nobody can
 * sign in as them.
 *
 *   node --import tsx scripts/seed/seed-dispatch-demo.mjs
 *   node --import tsx scripts/seed/seed-dispatch-demo.mjs --remove
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

for (const f of ['.env', '.env.local']) {
  try {
    for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (m) process.env[m[1]] ??= m[2]
    }
  } catch {}
}

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

// The board labels a column with `technician_id`, not the profile name, so this
// is set to the name to match how a real profile is stored (Surya Raj has
// technician_id = 'Surya Raj'). Using a distinct id here would put a raw
// 'DEMO-Tech-1' at the top of the board and read like a bug.
const DEMO_TECH = { name: 'Demo Technician', id: 'Demo Technician', email: 'demo.tech@dispatch.invalid' }
const prefix = 'SVC-DEMO-'

/** Monday of the week containing `d`, matching weekBounds() in utils/dates. */
function mondayOf(d) {
  const x = new Date(d)
  const dow = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - dow)
  return x
}
/** Local YYYY-MM-DD. The app reads `date` as a plain local day, never UTC. */
function ymd(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

async function remove() {
  // child rows first: evidence references services
  for (const t of ['job_signatures', 'job_parts', 'job_attachments']) {
    const { error } = await db.from(t).delete().like('service_id', `${prefix}%`)
    if (error) console.error(`  could not clear ${t}: ${error.message}`)
  }
  const { error: svcErr } = await db.from('services').delete().like('id', `${prefix}%`).select('id')
  if (svcErr) console.error('  could not clear services:', svcErr.message)
  else console.log('cleared demo visits')

  const { data: removed, error: profErr } = await db.from('profiles').delete().eq('email', DEMO_TECH.email).select('id')
  if (profErr) console.error('  could not remove the demo technician:', profErr.message)
  else console.log(`removed the demo technician profile (${removed?.length ?? 0})`)
  await db.from('profiles').delete().eq('technician_id', 'DEMO-Tech-1')

  const { data: left } = await db.from('services').select('id').like('id', `${prefix}%`)
  console.log(left?.length ? `WARNING: ${left.length} demo row(s) still present` : 'verified: no demo rows left')
}

async function seed() {
  const { data: customers } = await db.from('customers').select('id,name')
  if (!customers?.length) {
    console.error('No customers exist, so there is nothing to schedule visits against. Add a customer first.')
    process.exit(1)
  }
  const primary = customers[0]
  const second = customers[1] ?? customers[0]

  const { data: techs } = await db.from('profiles').select('name,technician_id,status').eq('role', 'technician')
  const real = (techs ?? []).find((t) => t.status === 'active' && t.technician_id !== DEMO_TECH.id)
  if (!real) {
    console.error('No active technician profile exists, so visits would have nobody to belong to. Approve a technician first.')
    process.exit(1)
  }

  await db.from('services').delete().like('id', `${prefix}%`)
  // Idempotent by email, not by technician_id: changing the id convention in a
  // previous version of this script would otherwise orphan the old profile and
  // the next run would fail on the unique email index.
  const { data: already } = await db.from('profiles').select('id,technician_id').eq('email', DEMO_TECH.email)
  if (already?.length) {
    const { error } = await db.from('profiles').update({ technician_id: DEMO_TECH.id, status: 'active', name: DEMO_TECH.name, is_demo: true }).eq('email', DEMO_TECH.email)
    if (error) {
      console.error('could not refresh the demo technician:', error.message)
      process.exit(1)
    }
    // Any profile still carrying the superseded id would claim a column of its own.
    await db.from('profiles').delete().eq('technician_id', 'DEMO-Tech-1')
  } else {
    const { error } = await db.from('profiles').insert({
      id: 'DEMO-' + crypto.randomUUID(),
      auth_uid: null,
      name: DEMO_TECH.name,
      email: DEMO_TECH.email,
      role: 'technician',
      status: 'active',
      technician_id: DEMO_TECH.id,
      // Keeps the example technician out of every list of people a job can be
      // assigned to, via activeTechnicians() in src/utils/technicians.ts. The
      // board still shows their column, because it builds columns from the
      // visits rather than from the assignable list.
      is_demo: true,
      note: 'Dispatch board demo data. Not a real account and cannot sign in.',
    })
    if (error) {
      console.error('could not create the demo technician:', error.message)
      process.exit(1)
    }
  }

  const mon = mondayOf(new Date())
  const day = (offset) => {
    const d = new Date(mon)
    d.setDate(d.getDate() + offset)
    return ymd(d)
  }

  const rows = [
    // A normal Monday for the real technician: two visits, no overlap.
    { id: prefix + '01', customer_id: primary.id, service_type: 'AC Service', date: day(0), technician: real.name, technician_id: real.technician_id, start_minute: 540, duration_minutes: 90, status: 'Scheduled', notes: 'Demo: quarterly AC service and filter check.' },
    { id: prefix + '02', customer_id: second.id, service_type: 'Refrigeration', date: day(0), technician: real.name, technician_id: real.technician_id, start_minute: 780, duration_minutes: 60, status: 'Scheduled', notes: 'Demo: compressor not cooling.' },
    // Overlaps the 09:00-10:30 slot above on purpose, to show the conflict flag.
    { id: prefix + '03', customer_id: primary.id, service_type: 'AC Service', date: day(0), technician: real.name, technician_id: real.technician_id, start_minute: 570, duration_minutes: 60, status: 'Scheduled', notes: 'Demo: overlaps the 09:00 visit on purpose.' },
    // A completed visit carrying a rating, so the board is not all "Scheduled".
    { id: prefix + '04', customer_id: primary.id, service_type: 'AC Service', date: day(2), technician: real.name, technician_id: real.technician_id, start_minute: 600, duration_minutes: 120, status: 'Completed', rating: 5, notes: 'Demo: AMC preventive visit, completed.' },
    { id: prefix + '05', customer_id: second.id, service_type: 'Water Purification', date: day(2), technician: real.name, technician_id: real.technician_id, start_minute: 960, duration_minutes: 60, status: 'Scheduled', notes: 'Demo: filter replacement.' },
    // No start time: belongs on the board, but as unscheduled work.
    { id: prefix + '06', customer_id: primary.id, service_type: 'AC Service', date: day(3), technician: real.name, technician_id: real.technician_id, start_minute: null, duration_minutes: 60, status: 'Scheduled', notes: 'Demo: needs a time agreed with the customer.' },
    // A second technician, so the board reads as a roster rather than one column.
    { id: prefix + '07', customer_id: primary.id, service_type: 'Elevator', date: day(1), technician: DEMO_TECH.name, technician_id: DEMO_TECH.id, start_minute: 540, duration_minutes: 90, status: 'Scheduled', notes: 'Demo: monthly elevator inspection.' },
    { id: prefix + '08', customer_id: second.id, service_type: 'HVAC', date: day(1), technician: DEMO_TECH.name, technician_id: DEMO_TECH.id, start_minute: 840, duration_minutes: 120, status: 'In Progress', notes: 'Demo: duct cleaning, in progress.' },
    { id: prefix + '09', customer_id: primary.id, service_type: 'Generator', date: day(4), technician: DEMO_TECH.name, technician_id: DEMO_TECH.id, start_minute: 600, duration_minutes: 60, status: 'Scheduled', notes: 'Demo: annual servicing.' },
  ]

  const { error } = await db.from('services').upsert(rows, { onConflict: 'id' })
  if (error) {
    console.error('could not seed services:', error.message)
    process.exit(1)
  }

  console.log(`Seeded ${rows.length} demo visits for the week of ${ymd(mon)}:`)
  for (const r of rows) {
    console.log(`  ${r.id}  ${r.date} ${hhmm(r.start_minute ?? 0).padEnd(5)}  ${String(r.technician).padEnd(17)} ${r.status}`)
  }
  console.log('')
  console.log(`  ${prefix}01 and ${prefix}03 deliberately overlap, so the conflict highlighting is visible.`)
  console.log(`  ${prefix}06 has no start time, so it is parked as unscheduled rather than placed at midnight.`)
  console.log('')
  console.log('Remove it all again with:')
  console.log('  node --import tsx scripts/seed/seed-dispatch-demo.mjs --remove')
}

await (process.argv.includes('--remove') ? remove() : seed())
