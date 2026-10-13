// Verifies the post-wipe state: admin can still sign in with no profile row,
// the AMC + retention examples are visible, and every other area is empty.
//   node scripts/tmp-scan/verify-clean-state.mjs
import { readFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5174'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const ADMIN = { email: 'darshan.sirpi@gmail.com', password: 'admin123' }
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
const rest = async (p) => fetch(SB + '/rest/v1/' + p, { headers: { apikey: K, Authorization: 'Bearer ' + K } })
const count = async (t) =>
  (await fetch(SB + `/rest/v1/${t}?select=id`, { headers: { apikey: K, Authorization: 'Bearer ' + K, Prefer: 'count=exact', Range: '0-0' } })).headers.get('content-range')
const authUsers = async () =>
  (await fetch(SB + '/auth/v1/admin/users', { headers: { apikey: K, Authorization: 'Bearer ' + K } })).json()

async function main() {
  console.log('\nA. Admin can sign in with no profile row')
  const browser = await chromium.launch({ executablePath: EDGE, headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  await page.locator('input').nth(0).fill(ADMIN.email)
  await page.locator('input').nth(1).fill(ADMIN.password)
  await page.getByRole('button', { name: /sign in|log in/i }).first().click()
  const signedIn = await waitFor(page, async () => !page.url().includes('/login'), 30000)
  check('A1 admin login accepted', signedIn, page.url())
  check('A2 signed in as admin', await hasText(page, 'Service Operations') || await hasText(page, 'Admin'))
  check('A3 no "account not found" error', !(await hasText(page, 'No account found with this email')))

  console.log('\nB. The single AMC example is visible')
  await page.goto(`${BASE}/amc-contracts`, { waitUntil: 'domcontentloaded' })
  await waitFor(page, () => hasText(page, 'AMC-EXAMPLE-1'), 25000)
  check('B1 example contract listed', await hasText(page, 'AMC-EXAMPLE-1'))
  check('B2 its customer is shown', await hasText(page, 'Example Customer'))
  const rowCount = await page.locator('tbody tr').count()
  check('B3 exactly one contract row', rowCount === 1, `${rowCount} rows`)

  console.log('\nC. The single retention example is visible')
  await page.goto(`${BASE}/retention`, { waitUntil: 'domcontentloaded' })
  await waitFor(page, () => hasText(page, 'Example Customer'), 25000)
  const retRows = await page.locator('tbody tr').count()
  check('C1 retention list has one row', retRows === 1, `${retRows} rows`)
  check('C2 the renewal action is described', await hasText(page, 'renewal'))

  console.log('\nD. Everything else is empty')
  for (const [route, label] of [
    ['/services', 'Services'],
    ['/complaints', 'Complaints'],
    ['/payments', 'Payments'],
  ]) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1800)
    const body = (await page.locator('tbody').first().innerText().catch(() => '')).trim()
    const rows = await page.locator('tbody tr').count()
    // A table with no data renders one "nothing here yet" row, not zero rows.
    const isEmpty = rows === 0 || /no\s/i.test(body)
    check(`D ${label} shows an empty state, no leftover rows`, isEmpty, body.replace(/\s+/g, ' ').slice(0, 70))
  }
  await page.goto(`${BASE}/customers`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  const custRows = await page.locator('tbody tr').count()
  check('D Customers holds exactly the one example', custRows === 1 && (await hasText(page, 'Example Customer')), `${custRows} rows`)

  console.log('\nE. Mail queues are empty')
  await page.goto(`${BASE}/outbox`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  check('E1 no queued emails', (await page.locator('tbody tr').count()) === 0)

  console.log('\nF. Database agrees with the screen')
  for (const [t, expected] of [['customers', 1], ['amcs', 1], ['retention_actions', 1], ['services', 0], ['complaints', 0], ['payments', 0], ['outbox_emails', 0], ['profiles', 0]]) {
    const range = await count(t)
    const n = Number((range ?? '').split('/')[1] ?? -1)
    check(`F ${t} = ${expected}`, n === expected, String(n))
  }
  const users = await authUsers()
  check('F only the admin auth user remains', (users?.users?.length ?? 0) === 1, (users?.users ?? []).map((u) => u.email).join(','))

  console.log('\nG. No page errors')
  const realErrors = errors.filter((e) => !/favicon|ResizeObserver/i.test(e))
  check('G1 no console/page errors', realErrors.length === 0, realErrors.slice(0, 2).join(' | '))

  await browser.close()
  console.log(`\nRESULT: ${fails === 0 ? 'ALL PASS' : fails + ' FAILURES'}`)
  process.exit(fails === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
