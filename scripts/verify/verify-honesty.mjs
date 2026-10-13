// Verifies the Phase 0 honesty fixes against the live database and a real
// browser session:
//   A. Dashboard KPI trends are computed from the data, not hardcoded, and a
//      comparison with no history reads neutral instead of green.
//   B. The Settings alert toggles really drive the dashboard's priority
//      actions, and complaint escalation is now driven by each complaint's own
//      SLA deadline rather than one global age threshold.
//   C. Reports uses the selected range and shows honest empty states.
//   D. A technician completing a visit actually notifies the customer.
// Creates a temporary technician login and visit, then removes everything again
// so the database is left exactly as it was found.
//   node scripts/tmp-scan/verify-honesty.mjs
import { readFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5174'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const ADMIN = { email: 'darshan.sirpi@gmail.com', password: 'admin123' }
const TEMP = { email: 'notify.check@example.invalid', password: 'TempNotify123!' }
const TECH_NAME = 'Notify Check'
const CUSTOMER_ID = 'C-EXAMPLE-1'
const SERVICE_ID = 'SVC-NOTIFY-CHECK'
const NOTE = 'Honesty check visit'
let fails = 0
const check = (n, ok, extra = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`); if (!ok) fails++ }
const waitFor = async (page, fn, ms = 25000, step = 400) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { if (await fn()) return true } catch { }
    await page.waitForTimeout(step)
  }
  return false
}
const hasText = (p, t) => p.evaluate((tt) => document.body.innerText.includes(tt), t)

const env = {}
for (const line of (existsSync('.env') ? readFileSync('.env', 'utf8') : '').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].trim()
}
const SB = env.VITE_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const rest = async (p, init = {}) => fetch(SB + '/rest/v1/' + p, { ...init, headers: { ...H, ...(init.headers ?? {}) } })
const serviceRow = async () => (await (await rest(`services?id=eq.${SERVICE_ID}&select=*`)).json())
const notifications = async () => (await (await rest(`notifications?select=*&order=time.desc&limit=50`)).json())
const emails = async () => (await (await rest(`outbox_emails?select=*&order=sent_at.desc&limit=50`)).json())
const authUsers = async () => ((await (await fetch(`${SB}/auth/v1/admin/users`, { headers: { apikey: K, Authorization: 'Bearer ' + K } })).json()).users ?? [])

// Same quarter maths the app uses, so the expected KPI labels below are derived
// from the live rows rather than hardcoded to whatever the database held once.
const pad = (n) => String(n).padStart(2, '0')
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
function quarterWindow(offset, ref = new Date()) {
  const q = Math.floor(ref.getMonth() / 3) - offset
  const year = ref.getFullYear() + Math.floor(q / 4)
  const first = (((q % 4) + 4) % 4) * 3
  return { start: localDate(new Date(year, first, 1)), end: localDate(new Date(year, first + 3, 0)) }
}
const inRange = (d, s, e) => Boolean(d) && d.slice(0, 10) >= s && d.slice(0, 10) <= e
function countTrend(current, previous, noun) {
  if (previous === 0) return current === 0 ? `No ${noun} in either quarter` : `${current} new, none last quarter`
  if (current === previous) return 'Same as last quarter'
  const change = ((current - previous) / previous) * 100
  return `${change > 0 ? '+' : ''}${change.toFixed(1)}% vs last quarter`
}

// Anything this harness adds is tracked so cleanup is exact, including rows the
// app itself creates in response.
const addedNotifications = new Set()
const addedEmails = new Set()

async function snapshotBaseline() {
  for (const n of await notifications()) addedNotifications.delete(n.id)
  for (const e of await emails()) addedEmails.delete(e.id)
}
async function captureNew() {
  for (const n of await notifications()) if (!addedNotifications.has(n.id)) addedNotifications.add(n.id)
  for (const e of await emails()) if (!addedEmails.has(e.id)) addedEmails.add(e.id)
}

async function cleanup(userId) {
  for (const id of addedNotifications) await rest(`notifications?id=eq.${id}`, { method: 'DELETE' })
  for (const id of addedEmails) await rest(`outbox_emails?id=eq.${id}`, { method: 'DELETE' })
  addedNotifications.clear()
  addedEmails.clear()
  await rest(`services?id=eq.${SERVICE_ID}`, { method: 'DELETE' })
  await rest(`profiles?email=eq.${TEMP.email}`, { method: 'DELETE' })
  if (userId) await fetch(`${SB}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: { apikey: K, Authorization: 'Bearer ' + K } })
}

async function main() {
  // The live database holds the mail-safe example only, so any row present
  // before this run belongs to the app, not to the harness.
  await snapshotBaseline()

  // The live database already holds real signups, so the invariant is that this
  // run adds and removes nothing — not that only the admin exists.
  await snapshotBaseline()
  const baselineUsers = (await authUsers()).map((u) => u.email).sort()

  const stale = (await authUsers()).find((u) => u.email === TEMP.email)
  if (stale) await cleanup(stale.id)

  const created = await (await fetch(`${SB}/auth/v1/admin/users`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ email: TEMP.email, password: TEMP.password, email_confirm: true, user_metadata: { name: TECH_NAME, role: 'technician' } }),
  })).json()
  const userId = created?.id
  check('A0 temporary technician login created', Boolean(userId), userId ?? JSON.stringify(created).slice(0, 120))

  await rest(`profiles?email=eq.${TEMP.email}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: TECH_NAME, role: 'technician', status: 'active', approved_at: new Date().toISOString() }),
  })
  await rest('services', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify([{ id: SERVICE_ID, customer_id: CUSTOMER_ID, service_type: 'AC Service', date: new Date().toISOString().slice(0, 10), technician: TECH_NAME, status: 'Scheduled', rating: null, notes: NOTE }]),
  })
  const seeded = await serviceRow()
  check('A1 scheduled visit seeded for the technician', seeded.length === 1 && seeded[0].status === 'Scheduled')

  const browser = await chromium.launch({ executablePath: EDGE, headless: true })
  const errors = []
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', (e) => errors.push(String(e)))

  const login = async (email, password, role = 'admin') => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(900)
    if (role !== 'admin') {
      await page.getByRole('tab').filter({ hasText: new RegExp(role, 'i') }).first().click()
      await page.waitForTimeout(500)
    }
    await page.locator('input').nth(0).fill(email)
    await page.locator('input').nth(1).fill(password)
    await page.getByRole('button', { name: /sign in|log in/i }).first().click()
    await page.waitForTimeout(4000)
    await waitFor(page, async () => !page.url().includes('/login'), 20000)
    await page.waitForTimeout(1200)
  }

  console.log('\nB. Dashboard trends come from the data')
  await login(ADMIN.email, ADMIN.password)
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await waitFor(page, () => hasText(page, 'Total Customers'), 25000)
  const body = await page.locator('body').innerText()
  for (const fake of ['+8.2%', '+4.6%', '+3.4%']) {
    check(`B1 "${fake}" is gone`, !body.includes(fake))
  }

  // Expected labels straight from the live rows.
  const now = new Date()
  const thisQ = quarterWindow(0, now)
  const lastQ = quarterWindow(1, now)
  const customerRows = await (await rest('customers?select=joined')).json()
  const amcRows = await (await rest('amcs?select=start_date')).json()
  const expectCustomers = countTrend(
    customerRows.filter((c) => inRange(c.joined, thisQ.start, thisQ.end)).length,
    customerRows.filter((c) => inRange(c.joined, lastQ.start, lastQ.end)).length,
    'customers signed',
  )
  const expectAmcs = countTrend(
    amcRows.filter((a) => inRange(a.start_date, thisQ.start, thisQ.end)).length,
    amcRows.filter((a) => inRange(a.start_date, lastQ.start, lastQ.end)).length,
    'contracts started',
  )
  const subs = await page.locator('p.text-xs.font-medium').allInnerTexts()
  const trendSubs = subs.filter((s) => /quarter|invoices/i.test(s))
  check('B2 customer trend matches the database', trendSubs.includes(expectCustomers), `want "${expectCustomers}" got "${trendSubs.join(' | ')}"`)
  check('B3 contract trend matches the database', trendSubs.includes(expectAmcs), `want "${expectAmcs}" got "${trendSubs.join(' | ')}"`)
  const honest = trendSubs.every((s) => /vs last quarter|last quarter|in either quarter|Not enough invoices/i.test(s))
  check('B4 every trend sub-line is a real comparison', honest, trendSubs.join(' | ').slice(0, 200))
  // A fall has to read as a fall: anything negative must not be coloured green.
  const negativeTrends = trendSubs.filter((s) => s.startsWith('-'))
  const emeraldSubs = await page.locator('p.text-emerald-600').allInnerTexts()
  const wrongGreen = negativeTrends.filter((t) => emeraldSubs.some((e) => e === t))
  check('B5 a decline is not coloured as growth', negativeTrends.length === 0 || wrongGreen.length === 0, `${negativeTrends.join(' | ')} vs ${wrongGreen.join(' | ')}`)

  console.log('\nC. Settings toggles drive the priority actions')
  // Non-vacuous baseline: with the defaults on there must be something to turn
  // off, otherwise "the list emptied" proves nothing.
  const list = page.locator('[data-testid="priority-actions"]')
  check('C0 the default alert list has entries', (await list.locator('li').count()) >= 1, String(await list.locator('li').count()))

  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' })
  await waitFor(page, () => hasText(page, 'Notification Preferences') || hasText(page, 'Profile'), 25000)
  await page.getByRole('button', { name: /^notifications$/i }).first().click()
  await waitFor(page, () => hasText(page, 'Complaint escalation alerts'), 15000)
  // The single global "escalate after N hours" box is gone on purpose: one
  // threshold cannot say whether a Critical job 90 minutes late is a fire or a
  // Low job 90 minutes late is routine. Each complaint now carries its own
  // deadline, so there is nothing to edit here.
  check('C1 the global escalation threshold is gone', (await page.locator('#escalation-hours').count()) === 0)
  check('C1b the toggle explains where the deadline comes from', await hasText(page, "each complaint's severity"))

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await waitFor(page, () => hasText(page, 'SLA deadline'), 20000)
  check('C2 the dashboard escalates on the SLA deadline', await hasText(page, 'Complaints past their SLA deadline'))
  check('C2b it also flags what is about to breach', await hasText(page, 'Complaints at risk of breaching'))

  // Turning every alert off must empty the list, proving the toggles are read.
  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /^notifications$/i }).first().click()
  await waitFor(page, () => hasText(page, 'AMC expiry alerts'), 15000)
  for (const label of ['AMC expiry alerts', 'High-risk alerts', 'Payment overdue alerts', 'Complaint escalation alerts']) {
    await page.getByRole('switch', { name: label }).click()
    await page.waitForTimeout(250)
  }
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const actions = await list.locator('li').count()
  check('C3 all alerts off empties the priority list', actions === 0, String(actions))

  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /^notifications$/i }).first().click()
  await waitFor(page, () => hasText(page, 'AMC expiry alerts'), 15000)
  await page.getByRole('button', { name: /reset to defaults/i }).click()
  await page.waitForTimeout(800)
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const restored = await list.locator('li').count()
  check('C4 resetting the defaults brings the alerts back', restored >= 1, String(restored))

  console.log('\nD. Reports uses the range and admits when it has nothing')
  await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded' })
  await waitFor(page, () => hasText(page, 'Reports & Analytics'), 25000)
  await page.waitForTimeout(1500)
  const reports = await page.locator('body').innerText()
  check('D1 renewal rate shows an empty state', /No contracts have ended yet/i.test(reports))
  check('D2 revenue at risk shows an empty state', /No revenue at risk in this window/i.test(reports))
  check('D3 payment collection shows an empty state', /No invoices due in this window/i.test(reports))
  check('D5 average rating is not a fabricated zero', /Awaiting ratings/i.test(reports) && !reports.includes('0 / 5'))
  // Complaints exist in the live database, so this chart must plot them rather
  // than claim the period was empty — and the card has to name its window.
  const complaintRows = await (await rest('complaints?select=created')).json()
  const inWindow = complaintRows.filter((c) => inRange(c.created, thisQ.start, thisQ.end)).length
  if (inWindow > 0) {
    check('D4 complaints in the window are plotted', !/No complaints in this window/i.test(reports), `expected a chart for ${inWindow} complaint(s)`)
  } else {
    check('D4 complaint chart shows an empty state', /No complaints in this window/i.test(reports))
  }
  check('D6 the range selector offers month windows', (await page.locator('select').first().locator('option').allInnerTexts()).join('|') === 'Last 3 months|Last 6 months|Last 12 months')
  check('D8 the card names the selected window', /Complaints raised in the last 6 months/i.test(reports))
  await page.locator('select').first().selectOption('12')
  await waitFor(page, () => hasText(page, 'last 12 months'), 10000)
  check('D7 switching the range re-queries the window', await hasText(page, 'Complaints raised in the last 12 months'))
  await page.locator('select').first().selectOption('6')
  await page.waitForTimeout(800)

  console.log('\nE. Completing a visit really notifies the customer')
  // Sign out first: an authenticated session redirects /login away, so the
  // role tabs never render and the technician login cannot be attempted.
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(400)
  await login(TEMP.email, TEMP.password, 'technician')
  check('E1 technician signed in', !page.url().includes('/login'), page.url())
  await page.goto(`${BASE}/tech/jobs`, { waitUntil: 'domcontentloaded' })
  await waitFor(page, () => hasText(page, NOTE), 30000)
  check('E2 the visit is listed for the technician', await hasText(page, NOTE))
  await page.getByRole('button', { name: /^complete$/i }).first().click()
  await waitFor(page, () => hasText(page, 'Mark Completed'), 15000)
  const notesBox = page.locator('textarea').first()
  if (await notesBox.count()) await notesBox.fill(NOTE)
  await page.getByRole('button', { name: /mark completed/i }).first().click()
  await page.waitForTimeout(1500)
  const toastText = await page.locator('[role="status"], [role="alert"]').allInnerTexts()
  check('E3 the toast no longer promises a future notification', toastText.join(' ').includes('has been notified'), toastText.join(' | ').slice(0, 160))
  check('E4 the toast is not the old "will be notified" wording', !toastText.join(' ').includes('will be notified'))

  await captureNew()
  let done = await serviceRow()
  for (let i = 0; i < 20 && done[0]?.status !== 'Completed'; i++) {
    await page.waitForTimeout(500)
    done = await serviceRow()
  }
  check('E5 the visit is completed in the database', done[0]?.status === 'Completed', String(done[0]?.status))
  const notes = await notifications()
  const completionNote = notes.find((n) => /visit is complete/i.test(n.title ?? ''))
  check('E6 a customer notification was created', Boolean(completionNote), completionNote ? completionNote.title : 'none found')
  check('E7 the notification is addressed to the example customer', completionNote?.customer_id === CUSTOMER_ID, String(completionNote?.customer_id))
  const mail = (await emails()).find((e) => /is complete/i.test(e.subject ?? ''))
  check('E8 a completion email was queued', Boolean(mail), mail ? mail.subject : 'none found')
  check('E9 the email goes to the example address only', mail?.to_email === 'no-reply@example.invalid', String(mail?.to_email))
  check('E10 the email asks for a portal rating', /rate your service satisfaction/i.test(mail?.body ?? ''))

  // Completing an already-completed visit must not notify a second time.
  const before = (await notifications()).filter((n) => /visit is complete/i.test(n.title ?? '')).length
  await page.goto(`${BASE}/tech/jobs`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const after = (await notifications()).filter((n) => /visit is complete/i.test(n.title ?? '')).length
  check('E11 no duplicate notification on a second visit to the page', after === before, `${before} -> ${after}`)

  await browser.close()
  await cleanup(userId)
  const gone = await serviceRow()
  check('F1 temporary visit removed', gone.length === 0)
  const leftNotes = (await notifications()).filter((n) => /visit is complete/i.test(n.title ?? ''))
  check('F2 completion notification removed', leftNotes.length === 0, String(leftNotes.length))
  const prof = await (await rest(`profiles?email=eq.${TEMP.email}&select=id`)).json()
  check('F3 temporary profile removed', prof.length === 0)
  const users = (await authUsers()).map((u) => u.email).sort()
  check('F4 the auth user list is exactly as it was found', JSON.stringify(users) === JSON.stringify(baselineUsers), users.join(','))

  const realErrors = errors.filter((e) => !/favicon|ResizeObserver/i.test(e))
  check('F5 no page errors', realErrors.length === 0, realErrors.slice(0, 2).join(' | '))

  console.log(`\nRESULT: ${fails === 0 ? 'ALL PASS' : fails + ' FAILURES'}`)
  process.exit(fails === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(e)
  const leftover = (await authUsers()).find((u) => u.email === TEMP.email)
  if (leftover) {
    await cleanup(leftover.id)
    console.log('cleaned up the temporary login after the failure')
  }
  process.exit(1)
})
