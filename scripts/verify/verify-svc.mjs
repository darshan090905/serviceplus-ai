import { readFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5174'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const waitFor = async (page, fn, ms = 25000, step = 400) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { if (await fn()) return true } catch { }
    await page.waitForTimeout(step)
  }
  return false
}
const hasText = (p, t) => p.evaluate((tt) => document.body.innerText.includes(tt), t)
// The app fires a simulated "Incoming AI call" overlay when a complaint is
// assigned; it covers the page, so dismiss it before interacting.
const dismissCall = async (p) => {
  const dlg = p.getByRole('dialog', { name: 'Incoming AI call' })
  for (let i = 0; i < 4; i++) {
    if (!(await dlg.isVisible().catch(() => false))) return
    for (const name of ['End call', 'Decline call']) {
      const btn = dlg.getByRole('button', { name })
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ force: true }).catch(() => {})
        await p.waitForTimeout(500)
      }
    }
  }
}
let fails = 0
const check = (n, ok, extra = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`); if (!ok) fails++ }
const seedSession = (p, s) => p.evaluate((v) => { const x = JSON.stringify(v); localStorage.setItem('sp-session', x); sessionStorage.setItem('sp-session', x) }, s)

// ---- service-role REST helpers (for seeding + asserting persisted state) ----
const env = {}
for (const line of (existsSync('.env') ? readFileSync('.env', 'utf8') : '').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].trim()
}
const SB = env.VITE_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY
const rest = async (path, init = {}) =>
  fetch(SB + '/rest/v1/' + path, {
    ...init,
    headers: {
      apikey: K,
      Authorization: 'Bearer ' + K,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  })
const getService = async (id) => (await rest(`services?select=id,status,check_in_at,check_out_at,arrived_lat,customer_lat,customer_lng&id=eq.${encodeURIComponent(id)}`)).json()
const waitForDb = async (fn, ms = 15000, step = 500) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { if (await fn()) return true } catch { }
    await sleep(step)
  }
  return false
}
const fmtDur = (min) => {
  const r = Math.max(0, Math.round(min))
  if (r < 60) return `${r} min`
  const h = Math.floor(r / 60), m = r % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`
}
const expectedEstimate = async (customerId, serviceType) => {
  const rows = await (await rest(`services?select=id,status,check_in_at,check_out_at&customer_id=eq.${encodeURIComponent(customerId)}&service_type=eq.${encodeURIComponent(serviceType)}&status=eq.Completed`)).json()
  const mins = rows
    .filter((r) => r.check_in_at && r.check_out_at)
    .map((r) => (Date.parse(r.check_out_at) - Date.parse(r.check_in_at)) / 60000)
    .filter(Number.isFinite)
  if (!mins.length) return null
  return fmtDur(mins.reduce((a, b) => a + b, 0) / mins.length)
}

// Seed one timed completed visit (C-514 AC Service, Upendra, 45 min on-site)
// so estimates + duration rendering have real historical data, plus a fresh
// Scheduled visit (unique id) that the geo E2E drives end-to-end.
const geoSeedId = 'SVC-GEO-1'
const inAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
const outAt = new Date(Date.now() - 3 * 60 * 60 * 1000 + 45 * 60 * 1000).toISOString()
const LIVID = `SVC-GEO-T-${Date.now()}`
// Clean up leftovers from prior runs so history/estimates stay deterministic.
// The LIKE wildcard must be sent as %25 — a raw % in the path returns a 500.
console.log('  cleanup:', (await rest(`services?id=like.SVC-GEO-T-%25`, {
  method: 'DELETE',
  headers: { Prefer: 'return=minimal' },
})).status)
const seedRes = await rest(`services?on_conflict=id`, {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates' },
  body: JSON.stringify([
    {
      id: geoSeedId, customer_id: 'C-514', service_type: 'AC Service', date: inAt.slice(0, 10),
      technician: 'Upendra Raj', status: 'Completed', rating: 5, notes: 'geo-seed',
      check_in_at: inAt, check_out_at: outAt, arrived_lat: 19.1111, arrived_lng: 72.8686,
    },
    {
      id: LIVID, customer_id: 'C-514', service_type: 'AC Service', date: outAt.slice(0, 10),
      technician: 'Upendra Raj', status: 'Scheduled', rating: null, notes: 'geo-e2e',
      check_in_at: null, check_out_at: null, arrived_lat: null, arrived_lng: null,
    },
  ]),
})
const seedBody = await seedRes.text()
if (seedRes.status >= 400) throw new Error(`seed failed ${seedRes.status}: ${seedBody.slice(0, 300)}`)
console.log(`  seed: ${seedRes.status} ${seedBody.slice(0, 200)}`)

const b = await chromium.launch({ executablePath: EDGE, headless: true })

// ---------- ADMIN ----------
const ctx1 = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p1 = await ctx1.newPage()
await p1.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p1.locator('input[type=email]').first().fill('darshan.sirpi@gmail.com')
await p1.locator('input[type=password]').first().fill('admin123')
await p1.getByRole('button', { name: /Sign in as admin/i }).click()
await p1.waitForURL(/dashboard/, { timeout: 45000 })
console.log('  [admin] waiting for store hydration…')
await sleep(95000)
await p1.locator('a[href="/services"]').first().click()
await p1.waitForURL(/\/services$/, { timeout: 20000 })
await sleep(3000)
check('A1. Technicians tab present', await waitFor(p1, () => p1.getByRole('button', { name: 'Technicians' }).isVisible().catch(() => false), 10000))
check('A2. Upendra Raj in directory', await hasText(p1, 'Upendra Raj'))
check('A3. Sudeep nayak in directory', await hasText(p1, 'Sudeep nayak'))
check('A4. old techs still listed (Vikas Rao)', await hasText(p1, 'Vikas Rao'))
check('A5. technician averages rendered (Vikas 3.3, no "No ratings yet")', await p1.evaluate(() => document.body.innerText.includes('3.3') && !document.body.innerText.includes('No ratings yet')))
await p1.getByRole('button', { name: 'Service History' }).click()
await sleep(800)
check('A6. Service History shows seeded rows', await waitFor(p1, () => hasText(p1, 'Water Purification'), 10000))

// ---------- TECH (real auth: Upendra Raj) ----------
const ctx2 = await b.newContext({ viewport: { width: 1440, height: 900 } })
await ctx2.setGeolocation({ latitude: 19.12, longitude: 72.87 })
await ctx2.grantPermissions(['geolocation'])
const p2 = await ctx2.newPage()
await p2.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p2.getByRole('tab', { name: /Technician/i }).click()
await p2.locator('input[type=email]').fill('darshanpatgar80@gmail.com')
await p2.locator('input[type=password]').fill('ServicePulse#Test1')
await p2.getByRole('button', { name: /Sign in as technician/i }).click()
await p2.waitForURL(/tech/, { timeout: 45000 })
console.log('  [tech] waiting for store hydration…')
await sleep(95000)
await p2.goto(`${BASE}/tech/jobs`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await sleep(2000)
check('B1. Upendra jobs show AC Service', await waitFor(p2, () => hasText(p2, 'AC Service'), 15000))
check('B2. rated completed HVAC visit shown', await hasText(p2, 'HVAC'))
check('B3. assigned complaint appears (Complaint)', await waitFor(p2, () => hasText(p2, 'Complaint'), 15000))
check('B4. statuses rendered', await p2.evaluate(() => document.body.innerText.includes('In Progress') && document.body.innerText.includes('Completed')))

// ---------- CUSTOMER (real auth: kiran C-514) ----------
const ctx3 = await b.newContext({ viewport: { width: 1440, height: 900 } })
await ctx3.setGeolocation({ latitude: 19.1136, longitude: 72.8697 })
await ctx3.grantPermissions(['geolocation'])
const p3 = await ctx3.newPage()
await p3.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p3.getByRole('tab', { name: /Customer/i }).click()
await p3.locator('input[type=email]').fill('kiran1.sirpi@gmail.com')
await p3.locator('input[type=password]').fill('ServicePulse#Test1')
await p3.getByRole('button', { name: /Sign in as customer/i }).click()
await p3.waitForURL(/portal/, { timeout: 45000 })
console.log('  [customer] waiting for store hydration…')
await sleep(95000)
await p3.goto(`${BASE}/portal/services`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await sleep(2000)
check('C1. AMC contracts listed (>=3 Contract badges)', await waitFor(p3, () => p3.locator('text=Contract').count().then((n) => n >= 3), 15000))
check('C2. Water Purification visit shown', await waitFor(p3, () => hasText(p3, 'Water Purification'), 15000))
check('C3. new techs shown as assigned', await p3.evaluate(() => document.body.innerText.includes('Sudeep nayak') && document.body.innerText.includes('Upendra Raj')))
check('C4. Active Contracts KPI present', await hasText(p3, 'Active Contracts'))

// ---------- D. LOCATION + ON-SITE TIME (customer pin -> technician) ----------
console.log('  [customer] sharing exact location…')
// Share the pin on the freshly-seeded visit (unique "geo-e2e" notes marker,
// assigned to Upendra) — avoids the pre-existing AC Service visit.
const shareRow = p3
  .locator('tr', { hasText: 'geo-e2e' })
  .filter({ has: p3.getByRole('button', { name: /Share exact location/i }) })
await waitFor(p3, () => shareRow.count().then((n) => n > 0).catch(() => false), 20000)
await shareRow.getByRole('button', { name: /Share exact location/i }).first().click()
check('D1. customer shared location chip appears (Location shared)', await waitFor(p3, () => hasText(p3, 'Location shared'), 15000))
check('D2. pin persisted to DB (customer_lat/lng set)', await waitForDb(async () => {
  const rows = await getService(LIVID)
  const r = Array.isArray(rows) ? rows[0] : null
  return Boolean(r && r.customer_lat != null && r.customer_lng != null)
}, 15000))

console.log('  [tech] check-in + on-site timer…')
const jobRow = p2.locator('tr', { hasText: 'geo-e2e' })
await waitFor(p2, () => jobRow.count().then((n) => n > 0).catch(() => false), 20000)
await jobRow.first().locator('span', { hasText: 'geo-e2e' }).first().click({ force: true })
check('D3. tech sees customer pinned location in panel', await waitFor(p2, () => hasText(p2, 'Customer pinned location shared'), 45000))
check('D4. tech sees live distance chip', await waitFor(p2, () => hasText(p2, 'You are '), 15000))
{
  const est = await expectedEstimate('C-514', 'AC Service')
  const exp = `Est. ${est ?? '—'}`
  check('D5. estimate shown on scheduled job', await waitFor(p2, () => hasText(p2, exp), 15000), `expected "${exp}"`)
}
await p2.getByRole('button', { name: /Check In/i }).first().click()
check('D6. job flips to On site (In Progress) with live timer', await waitFor(p2, () => hasText(p2, 'On site') && hasText(p2, 'min'), 15000))
await p2.getByRole('button', { name: /Complete/i }).first().click()
check('D7. complete modal shows on-site duration', await waitFor(p2, () => hasText(p2, 'On-site duration: '), 15000))
await p2.getByRole('button', { name: /Mark Completed/i }).click()
check('D8. visit marked done with total on-site time', await waitFor(p2, () => hasText(p2, 'total on-site time for this visit'), 20000))
check('D9. check-in/out + arrival coords persisted', await waitForDb(async () => {
  const rows = await getService(LIVID)
  const r = Array.isArray(rows) ? rows[0] : null
  return Boolean(r && r.status === 'Completed' && r.check_in_at && r.check_out_at && r.arrived_lat != null)
}, 15000))

console.log('  [admin] duration + directory avg…')
await p1.locator('a[href="/services"]').first().click()
await p1.waitForURL(/\/services$/, { timeout: 20000 })
await p1.getByRole('button', { name: 'Service History' }).click()
check('D10. admin history shows timed visit 45 min', await waitFor(p1, () => hasText(p1, geoSeedId) && hasText(p1, '45 min'), 15000))
await p1.getByRole('button', { name: 'Technicians' }).click()
check('D11. admin directory has Avg On-site column', await waitFor(p1, () => hasText(p1, 'AVG ON-SITE'), 15000))

const getComplaint = async (id) =>
  (await rest(
    `complaints?select=id,status,latitude,longitude,location_shared_at,assigned_at,arrived_at,arrival_lat,arrival_lng,work_started_at,work_completed_at,resolved_at&id=eq.${encodeURIComponent(id)}`,
  )).json()
const complaintCol = async (id, col) =>
  waitForDb(async () => {
    const rows = await getComplaint(id)
    const r = Array.isArray(rows) ? rows[0] : null
    return Boolean(r && r[col] != null)
  }, 20000)
const complaintStatus = async (id, status) =>
  waitForDb(async () => {
    const rows = await getComplaint(id)
    const r = Array.isArray(rows) ? rows[0] : null
    return Boolean(r && r.status === status)
  }, 20000)

// ---------- E. COMPLAINT LOCATION + ASSIGNMENT + TECHNICIAN WORKFLOW ----------
console.log('  [customer] raising complaint with exact location…')
await p3.goto(`${BASE}/portal/complaints/new`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await sleep(2000)
await p3.locator('input[placeholder*="Tell us what went wrong"]').fill('e2e complaint raised with an exact service location')
await p3.getByRole('button', { name: /Share My Location/i }).click()
check('E1. location picker confirms selection', await waitFor(p3, () => hasText(p3, 'Location selected'), 25000))
check('E2. coordinates + editable address shown', await waitFor(p3, () => hasText(p3, 'Coordinates:'), 10000))
await p3.getByRole('button', { name: /Submit Complaint/i }).click()
await p3.waitForURL(/\/portal\/complaints\/CMP-/, { timeout: 30000 })
const CMP = p3.url().split('/').pop()
console.log(`  [customer] complaint ${CMP} created with pin`)
check('E3. portal detail confirms location shared', await waitFor(p3, () => hasText(p3, 'Location shared'), 15000))
check('E4. complaint pin persisted (lat/lng + shared_at)', await complaintCol(CMP, 'location_shared_at') && await complaintCol(CMP, 'latitude') && await complaintCol(CMP, 'longitude'))

console.log('  [admin] assigning complaint…')
await p1.goto(`${BASE}/complaints/${CMP}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await sleep(2500)
check('E5. admin location card shows Get Route', await waitFor(p1, () => p1.getByRole('link', { name: /Get Route/i }).count().then((n) => n > 0), 20000))
check('E6. admin work timeline card visible', await waitFor(p1, () => hasText(p1, 'Work timeline'), 10000))
await dismissCall(p1)
await p1.getByLabel('Assign technician').selectOption({ label: 'Upendra Raj' })
await p1.getByRole('button', { name: /Confirm & Send Email/i }).click()
await sleep(1500)
await dismissCall(p1)
await p1.getByRole('button', { name: /Done & Verified/i }).click()
check('E7. assignment timestamp persisted', await complaintCol(CMP, 'assigned_at'))
check('E8. timeline shows assignment step', await waitFor(p1, () => hasText(p1, 'Assigned to technician'), 15000))

console.log('  [tech] working the complaint…')
await p2.goto(`${BASE}/tech/complaints`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await dismissCall(p2)
const cmpRow = p2.locator('li', { hasText: CMP })
check('E9. tech sees the assigned complaint', await waitFor(p2, () => cmpRow.count().then((n) => n > 0), 20000))
check('E10. tech sees location chip + Get Route', await waitFor(p2, () => hasText(p2, 'Location shared') && p2.getByRole('link', { name: /Get Route/i }).count().then((n) => n > 0), 15000))
check('E11. no admin timings on tech list', await p2.evaluate(() => {
  const t = document.body.innerText
  return !t.includes('Assigned → completed') && !t.includes('On-site work time') && !t.includes('Work timeline')
}))
await dismissCall(p2)
await cmpRow.getByRole('link', { name: /View/i }).first().click()
await p2.waitForURL(new RegExp(`/tech/complaints/${CMP}$`), { timeout: 20000 })
check('E12. tech detail renders map', await waitFor(p2, () => p2.locator('.leaflet-container').count().then((n) => n > 0), 30000))
await dismissCall(p2)
await p2.getByRole('button', { name: /I've reached location/i }).click()
check('E13. arrival recorded (arrived_at + arrival coords)', await complaintCol(CMP, 'arrived_at') && await complaintCol(CMP, 'arrival_lat'))
check('E14. Start work step appears after arrival', await waitFor(p2, () => p2.getByRole('button', { name: /^Start work$/i }).isVisible(), 20000))
await p2.getByRole('button', { name: /^Start work$/i }).click()
check('E15. work started (In Progress + work_started_at)', await complaintStatus(CMP, 'In Progress') && await complaintCol(CMP, 'work_started_at'))
await p2.getByRole('button', { name: /Complete work/i }).click()
await p2.getByLabel(/Work summary/i).fill('Replaced the faulty capacitor and verified cooling.')
await p2.getByRole('button', { name: /Confirm completion/i }).click()
check('E16. completed (Resolved + work_completed_at + resolved_at)', await complaintStatus(CMP, 'Resolved') && await complaintCol(CMP, 'work_completed_at') && await complaintCol(CMP, 'resolved_at'))
check('E17. resolution recorded', await waitFor(p2, () => hasText(p2, 'Replaced the faulty capacitor'), 20000))

console.log('  [admin] timeline, proximity + technician detail…')
await p1.reload({ waitUntil: 'domcontentloaded' })
await sleep(2500)
await dismissCall(p1)
check('E18. timeline shows reached/started/completed/resolved', await waitFor(p1, async () =>
  (await Promise.all(['Technician reached location', 'Work started', 'Work completed', 'Complaint resolved'].map((t) => hasText(p1, t)))).every(Boolean), 20000))
const text = await p1.evaluate(() => document.body.innerText)
check('E19. admin-only work + cycle durations', text.includes('On-site work time') && text.includes('Assigned → completed'))
check('E20. arrival proximity note', /Technician arrived [\d.]+ (m|km) from the customer pin/.test(text))
await p1.goto(`${BASE}/services`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await sleep(2000)
await p1.getByRole('button', { name: 'Technicians' }).click()
await sleep(1000)
check('E21. directory shows Contact + Total Service Time columns', await waitFor(p1, () => hasText(p1, 'CONTACT') && hasText(p1, 'TOTAL SERVICE TIME'), 15000))
await p1.locator('tr', { hasText: 'Upendra Raj' }).first().click()
await p1.waitForURL(/\/services\/technicians\//, { timeout: 20000 })
await sleep(2000)
await dismissCall(p1)
check('E22. technician detail: complaint history + metrics', await waitFor(p1, () =>
  hasText(p1, 'Complaint history') && hasText(p1, CMP) && hasText(p1, 'Avg time / complaint') && hasText(p1, 'Total service time'), 20000))
check('E23. technician detail arrival-vs-pin column', await p1.evaluate(() => document.body.innerText.includes('ARRIVAL VS PIN') && /\d+(\.\d+)? (m|km)/.test(document.body.innerText)))

await b.close()
console.log(fails === 0 ? '\nRESULT: ALL PASS' : `\nRESULT: ${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)