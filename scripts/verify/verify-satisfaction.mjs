// Verifies the satisfaction fix end to end: a customer rates a completed visit
// in the portal, the score lands on the service row, and the admin Services page
// shows it. Creates a temporary customer login + completed visit, then removes
// both again so the database is left exactly as it was found.
//   node scripts/tmp-scan/verify-satisfaction.mjs
import { readFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5174'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const ADMIN = { email: 'darshan.sirpi@gmail.com', password: 'admin123' }
const TEMP = { email: 'csat.check@example.invalid', password: 'TempCheck123!' }
const CUSTOMER_ID = 'C-EXAMPLE-1'
const SERVICE_ID = 'SVC-CSAT-CHECK'
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
const serviceRow = async () => (await (await rest(`${'services'}?id=eq.${SERVICE_ID}&select=*`)).json())

async function cleanup(userId) {
  await rest(`services?id=eq.${SERVICE_ID}`, { method: 'DELETE' })
  await rest(`profiles?email=eq.${TEMP.email}`, { method: 'DELETE' })
  if (userId) await fetch(`${SB}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: { apikey: K, Authorization: 'Bearer ' + K } })
}

async function main() {
  // Temporary fixture: a confirmed customer login (created via the admin API, so
  // no confirmation email is sent) plus one completed service visit.
  const existing = (await (await fetch(`${SB}/auth/v1/admin/users`, { headers: { apikey: K, Authorization: 'Bearer ' + K } })).json()).users ?? []
  const stale = existing.find((u) => u.email === TEMP.email)
  if (stale) await cleanup(stale.id)

  const created = await (await fetch(`${SB}/auth/v1/admin/users`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ email: TEMP.email, password: TEMP.password, email_confirm: true, user_metadata: { name: 'CSAT Check', role: 'customer' } }),
  })).json()
  const userId = created?.id
  check('A1 temporary customer login created', Boolean(userId), userId ?? JSON.stringify(created).slice(0, 120))

  // Creating the auth user fires the database signup trigger, which inserts the
  // profile as 'pending'. Attach it to the example customer and approve it.
  await rest(`profiles?email=eq.${TEMP.email}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: 'CSAT Check', role: 'customer', status: 'active', customer_id: CUSTOMER_ID, company: 'Example Company', approved_at: new Date().toISOString() }),
  })
  const prof0 = await (await rest(`profiles?email=eq.${TEMP.email}&select=status,customer_id`)).json()
  check('A0 temporary profile approved and linked', prof0[0]?.status === 'active' && prof0[0]?.customer_id === CUSTOMER_ID, JSON.stringify(prof0[0] ?? {}))
  await rest('services', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify([{ id: SERVICE_ID, customer_id: CUSTOMER_ID, service_type: 'AC Service', date: new Date().toISOString().slice(0, 10), technician: 'Example Technician', status: 'Completed', rating: null, notes: 'CSAT check visit' }]),
  })
  const seeded = await serviceRow()
  check('A2 completed visit with no rating', seeded.length === 1 && seeded[0].rating === null)

  const browser = await chromium.launch({ executablePath: EDGE, headless: true })
  const errors = []
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', (e) => errors.push(String(e)))

  const login = async (email, password, role = 'admin') => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(900)
    // The form defaults to the Admin tab, so pick the matching one first.
    if (role !== 'admin') {
      await page.getByRole('tab').filter({ hasText: new RegExp(role, 'i') }).first().click()
      await page.waitForTimeout(500)
    }
    await page.locator('input').nth(0).fill(email)
    await page.locator('input').nth(1).fill(password)
    await page.getByRole('button', { name: /sign in|log in/i }).first().click()
    await page.waitForTimeout(4000)
    const alert = await page.locator('[role="alert"]').first().innerText().catch(() => '')
    if (alert) console.log(`    [login alert] ${alert.replace(/\s+/g, ' ').slice(0, 160)}`)
    await waitFor(page, async () => !page.url().includes('/login'), 20000)
    await page.waitForTimeout(1200)
  }

  console.log('\nB. Customer rates the visit in the portal')
  await login(TEMP.email, TEMP.password, 'customer')
  check('B1 customer signed in', !page.url().includes('/login'), page.url())
  await page.goto(`${BASE}/portal/services`, { waitUntil: 'domcontentloaded' })
  await waitFor(page, async () => (await page.locator(`[data-testid="rate-${SERVICE_ID}"]`).count()) > 0, 30000)
  const picker = page.locator(`[data-testid="rate-${SERVICE_ID}"]`)
  check('B2 star picker shown for a completed unrated visit', (await picker.count()) === 1)
  check('B3 five stars offered', (await picker.locator('button').count()) === 5)
  await picker.getByRole('button', { name: /Rate visit .* 4 out of 5/ }).click()
  await waitFor(page, () => hasText(page, '4 / 5'), 15000)
  // The write-through is async, so give the round trip a moment.
  let rated = await serviceRow()
  for (let i = 0; i < 20 && rated[0]?.rating !== 4; i++) {
    await page.waitForTimeout(500)
    rated = await serviceRow()
  }
  check('B4 rating saved to the database', rated[0]?.rating === 4, String(rated[0]?.rating))
  check('B5 portal confirms the rating', await hasText(page, '4 / 5'))

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  check('B6 rating survives a reload', await hasText(page, '4 / 5'))
  check('B7 picker is gone once rated', (await page.locator(`[data-testid="rate-${SERVICE_ID}"]`).count()) === 0)

  console.log('\nC. Admin sees the satisfaction score')
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  await page.evaluate(() => localStorage.clear())
  await login(ADMIN.email, ADMIN.password)
  await page.goto(`${BASE}/services`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  // The page opens on the Technicians tab; the per-visit ratings live in Service History.
  await page.getByRole('button', { name: /service history/i }).first().click()
  await waitFor(page, () => hasText(page, 'CSAT check visit'), 25000)
  check('C1 service row listed', await hasText(page, 'CSAT check visit'))
  const headers = await page.locator('th').allInnerTexts()
  check('C2 the column is labelled Satisfaction', headers.some((h) => /satisfaction/i.test(h)), headers.join(' | ').slice(0, 120))
  const servicesBody = await page.locator('tbody').first().innerText()
  check('C3 the star score is in the row', /\b4\b/.test(servicesBody), servicesBody.replace(/\s+/g, ' ').slice(0, 90))
  check('C4 no "awaiting rating" on a rated visit', !servicesBody.includes('Awaiting customer rating'))

  await browser.close()
  await cleanup(userId)
  const after = await serviceRow()
  check('D1 temporary service removed', after.length === 0)
  const prof = await (await rest(`profiles?email=eq.${TEMP.email}&select=id`)).json()
  check('D2 temporary profile removed', prof.length === 0)
  const users = (await (await fetch(`${SB}/auth/v1/admin/users`, { headers: { apikey: K, Authorization: 'Bearer ' + K } })).json()).users ?? []
  check('D3 temporary auth user removed', users.length === 1 && users[0].email === ADMIN.email, users.map((u) => u.email).join(','))

  const realErrors = errors.filter((e) => !/favicon|ResizeObserver/i.test(e))
  check('E1 no page errors', realErrors.length === 0, realErrors.slice(0, 2).join(' | '))

  console.log(`\nRESULT: ${fails === 0 ? 'ALL PASS' : fails + ' FAILURES'}`)
  process.exit(fails === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(e)
  const users = (await (await fetch(`${SB}/auth/v1/admin/users`, { headers: { apikey: K, Authorization: 'Bearer ' + K } })).json()).users ?? []
  const leftover = users.find((u) => u.email === TEMP.email)
  if (leftover) {
    await cleanup(leftover.id)
    console.log('cleaned up the temporary login after the failure')
  }
  process.exit(1)
})
