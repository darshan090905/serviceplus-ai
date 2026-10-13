// Proves the two sync fixes in AppStore's poll, which the single-tab round-trip
// cannot see:
//   1. A row deleted in one session disappears from another open session.
//      Before, the poll's merge could only add and update, so a machine deleted
//      by another admin stayed on screen for the rest of the session — and a
//      delete that raced an in-flight poll re-added itself and never recovered.
//   2. A collection whose fetch FAILS is not mistaken for "no rows exist". The
//      assets fetch falls back to an empty list when the table is unreachable,
//      and treating that as truth would blank the whole equipment register.
//
// Two separate browser contexts stand in for two devices on the same account.
//   node scripts/tmp-scan/verify-assets-sync.mjs
import { readFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5174'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const ADMIN = { email: 'darshan.sirpi@gmail.com', password: 'admin123' }
const CUSTOMER_ID = 'C-EXAMPLE-1'
const STAMP = Date.now()
const NAME = `Sync Check ${STAMP}`
const ID = `AST-SYNC-${STAMP}`
const POLL = 30000

let fails = 0
const check = (n, ok, extra = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`); if (!ok) fails++ }
const waitFor = async (fn, ms = POLL + 20000, step = 1500) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { if (await fn()) return true } catch { }
    await new Promise((r) => setTimeout(r, step))
  }
  return false
}

const env = {}
for (const line of (existsSync('.env') ? readFileSync('.env', 'utf8') : '').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].trim()
}
const SB = env.VITE_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const rest = (p, i = {}) => fetch(`${SB}/rest/v1/${p}`, { ...i, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(i.headers ?? {}) } })
const rowCount = (page, name) => page.locator('tr', { hasText: name }).count()
const signIn = async (ctx) => {
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"]', ADMIN.email)
  await page.fill('input[type="password"]', ADMIN.password)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(5000)
  return page
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true })
let pageA, pageB
try {
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  pageA = await signIn(ctxA)
  pageB = await signIn(ctxB)

  // Seed the machine straight into the database, standing in for another device.
  const ins = await rest('assets', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ id: ID, customer_id: CUSTOMER_ID, name: NAME, category: 'AC', status: 'Active' }),
  })
  check('machine seeded into the database', ins.ok, `status ${ins.status}`)

  for (const [label, page] of [['A', pageA], ['B', pageB]]) {
    await page.goto(`${BASE}/assets`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    check(`session ${label} sees the seeded machine`, (await rowCount(page, NAME)) === 1)
  }

  // 1. Another device deletes it. Both open sessions must drop it on the next poll.
  const del = await rest(`assets?id=eq.${ID}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  check('machine deleted from the database by another device', del.status === 204, `status ${del.status}`)

  for (const [label, page] of [['A', pageA], ['B', pageB]]) {
    const dropped = await waitFor(async () => (await rowCount(page, NAME)) === 0)
    check(`session ${label} drops the machine deleted elsewhere`, dropped, `within one ${POLL / 1000}s poll`)
  }

  // 2. A failed fetch must not be read as "there is nothing here".
  // Block only the assets endpoint and leave the register open past a poll cycle.
  const before = (await rowCount(pageA, 'Equipment Register')) >= 0
  check('register is open before the fault is injected', before)
  await pageA.route('**/rest/v1/assets**', (route) => route.abort('failed'))
  const wiped = await new Promise(async (resolve) => {
    const end = Date.now() + POLL + 15000
    while (Date.now() < end) {
      // Still on the register, and it still shows its machine KPIs rather than
      // falling over to an error or a blank table.
      if (await pageA.locator('text=Active Machines').count()) return resolve(false)
      await pageA.waitForTimeout(1500)
    }
    resolve(true)
  })
  check('a failed assets fetch does not blank the register', !wiped, 'KPIs still rendered after a poll with the endpoint blocked')
  await pageA.unroute('**/rest/v1/assets**')

  // And it recovers on the next healthy poll.
  const recovered = await waitFor(async () => (await pageA.locator('text=Active Machines').count()) > 0, 40000)
  check('register recovers once the fetch succeeds again', recovered)

  // 3. A rejected write must not be swallowed. Before, addAsset fired the request
  // and threw the result away, so a machine saved on screen that was never stored
  // and vanished on the next reload, with no error anywhere.
  const FAILING = 'Rejected Write ' + STAMP
  await pageB.route('**/rest/v1/assets**', (route) =>
    route.request().method() === 'POST' ? route.abort('failed') : route.continue(),
  )
  await pageB.goto(`${BASE}/assets`, { waitUntil: 'domcontentloaded' })
  await pageB.waitForTimeout(3000)
  await pageB.getByRole('button', { name: /Add Machine/ }).first().click()
  await pageB.waitForTimeout(600)
  await pageB.locator('[role="dialog"] select').nth(0).selectOption(CUSTOMER_ID)
  await pageB.fill('[role="dialog"] input[placeholder="Split AC — Server Room"]', FAILING)
  await pageB.getByRole('button', { name: /^Add Machine$/ }).last().click()

  const errorShown = await waitFor(async () => await pageB.evaluate(() => document.body.innerText.includes('database refused')), 20000)
  check('a rejected write tells the user it failed', errorShown)
  const rolledBack = await waitFor(async () => (await rowCount(pageB, FAILING)) === 0, 15000)
  check('a rejected write is rolled back off the screen', rolledBack, 'no phantom row left behind')
  const stillOpen = await pageB.locator('[role="dialog"]').count()
  check('the form stays open so the entry is not lost', stillOpen > 0)
  const notStored = (await (await rest(`assets?select=id&name=eq.${encodeURIComponent(FAILING)}`)).json()).length === 0
  check('nothing was written to the database either', notStored)
  await pageB.unroute('**/rest/v1/assets**')
} catch (err) {
  check('harness ran to completion', false, String(err).slice(0, 220))
} finally {
  try {
    await rest(`assets?id=eq.${ID}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    const left = await (await rest(`assets?select=id&name=like.${encodeURIComponent('Sync Check%')}`)).json()
    if (left.length) {
      await rest(`assets?name=like.${encodeURIComponent('Sync Check%')}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
      console.log(`  cleaned ${left.length} extra sync row(s)`)
    }
  } catch (e) {
    console.log('  cleanup warning:', String(e).slice(0, 160))
  }
  await browser.close()
}

const residual = await (await rest(`assets?select=id&name=like.${encodeURIComponent('Sync Check%')}`)).json()
check('no fixture machines left behind', residual.length === 0, `${residual.length} left`)

console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`)
process.exit(fails === 0 ? 0 : 1)
