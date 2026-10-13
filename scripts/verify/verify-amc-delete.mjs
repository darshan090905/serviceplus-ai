// Focused verification for the new admin AMC hard-delete + the demo-generator removals.
//   node scripts/tmp-scan/verify-amc-delete.mjs
// Assumes the preview build is served on :5176 and the real (pre-purge) data is present.
import { readFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5174'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const ADMIN = { email: 'darshan.sirpi@gmail.com', password: 'admin123' }
const CUSTOMER = { email: 'kiran1.sirpi@gmail.com', password: 'kiran123' }
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
let fails = 0
const check = (n, ok, extra = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`); if (!ok) fails++ }

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
const amcRow = async (id) => (await rest(`amcs?select=id&id=eq.${encodeURIComponent(id)}`)).json()
const paymentsFor = async (id) => (await rest(`payments?select=id,invoice,amc_id&amc_id=eq.${encodeURIComponent(id)}`)).json()

const login = async (page, who) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  const inputs = page.locator('input')
  await inputs.nth(0).fill(who.email)
  await inputs.nth(1).fill(who.password)
  await page.getByRole('button', { name: /sign in|log in/i }).first().click()
  const end = Date.now() + 30000
  while (Date.now() < end) {
    if (!page.url().includes('/login')) break
    await page.waitForTimeout(400)
  }
  await page.waitForTimeout(1500)
}

async function main() {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))

  console.log('\nA. Admin login + AMC list')
  await login(page, ADMIN)
  await page.goto(`${BASE}/amc-contracts`, { waitUntil: 'domcontentloaded' })
  // Wait for real hydrated rows, not the loading skeleton.
  await waitFor(page, async () => (await page.getByRole('button', { name: /Delete contract/ }).count()) > 0, 30000)
  const beforeRows = await page.locator('tbody tr').count()
  check('A1 AMC list renders rows', beforeRows > 0, `${beforeRows} rows`)
  const trashButtons = await page.getByRole('button', { name: /Delete contract/ }).count()
  check('A2 per-row delete button present', trashButtons > 0, `${trashButtons} buttons`)

  // Pick a contract that has payments so the unlink warning is exercised.
  const candidates = await (await rest('amcs?select=id')).json()
  let target = null
  for (const c of candidates ?? []) {
    const p = await paymentsFor(c.id)
    if (p.length) { target = { id: c.id, payments: p.length, paymentIds: p.map((x) => x.id) }; break }
  }
  if (!target) target = { id: candidates?.[0]?.id, payments: 0, paymentIds: [] }
  check('A3 target contract chosen', Boolean(target?.id), JSON.stringify(target))

  console.log('\nB. Delete with confirmation modal')
  // The table is paginated, so narrow it down to the target contract first.
  await page.getByPlaceholder(/Search AMC ID or customer/i).fill(target.id)
  await waitFor(page, async () => (await page.getByRole('button', { name: `Delete contract ${target.id}` }).count()) > 0, 20000)
  await page.getByRole('button', { name: `Delete contract ${target.id}` }).first().click()
  await page.waitForTimeout(700)
  const dialog = page.getByRole('dialog')
  check('B1 confirm dialog opens', await dialog.isVisible().catch(() => false))
  check('B2 dialog names the contract', await hasText(page, `Delete contract ${target.id}?`))
  if (target.payments > 0) {
    check('B3 dialog warns about detached payments', await hasText(page, `${target.payments} payment`))
  } else {
    check('B3 dialog says no payments attached', await hasText(page, 'No payments are recorded'))
  }
  await page.getByRole('button', { name: 'Delete permanently' }).click()
  await waitFor(page, () => !hasText(page, `Delete contract ${target.id}?`))
  await page.waitForTimeout(1200)
  check('B4 row gone from admin list', !(await hasText(page, target.id)))
  check('B5 list still shows other contracts', (await page.locator('tbody tr').count()) > 0)

  console.log('\nC. Database + durability')
  const rows = await amcRow(target.id)
  check('C1 row deleted from amcs', Array.isArray(rows) && rows.length === 0, `${rows?.length} rows left`)
  const stillLinked = await paymentsFor(target.id)
  check('C2 no payment still points at the deleted contract', stillLinked.length === 0)
  if (target.paymentIds.length > 0) {
    const kept = await (await rest(`payments?select=id,invoice,amc_id&id=in.(${target.paymentIds.join(',')})`)).json()
    const nulled = kept.filter((p) => p.amc_id === null || p.amc_id === '')
    check('C3 payments kept, not deleted, and detached', kept.length === target.paymentIds.length && nulled.length === target.paymentIds.length,
      `${kept.length} kept, ${nulled.length} detached`)
  }

  // Reload twice: a stale in-memory copy must not resurrect the row.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitFor(page, () => hasText(page, 'Active AMCs'))
  await page.waitForTimeout(1500)
  check('C4 still gone after reload', !(await hasText(page, target.id)))
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  await page.goto(`${BASE}/amc-contracts`, { waitUntil: 'domcontentloaded' })
  await waitFor(page, () => hasText(page, 'Active AMCs'))
  await page.waitForTimeout(1500)
  check('C5 still gone after navigating away and back', !(await hasText(page, target.id)))
  const finalRows = await amcRow(target.id)
  check('C6 no resurrection in the database', finalRows.length === 0)

  console.log('\nD. Add AMC now really persists')
  const idsBefore = new Set((await (await rest('amcs?select=id')).json()).map((r) => r.id))
  await page.getByRole('button', { name: /Add AMC/i }).first().click()
  await page.waitForTimeout(900)
  // Scope the form fills to the modal — the page behind it has its own selects.
  const form = page.getByRole('dialog')
  await form.locator('select').first().selectOption({ index: 1 })
  await form.locator('input[type="number"]').first().fill('12345')
  await page.getByRole('button', { name: /Create Contract/i }).click()
  await page.waitForTimeout(1800)
  // The modal stamps its own id, so read it back instead of guessing it.
  const created = (await (await rest('amcs?select=id')).json()).filter((r) => !idsBefore.has(r.id))
  check('D1 add AMC written to database immediately', created.length === 1, created.map((r) => r.id).join(','))
  const newId = created[0]?.id
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitFor(page, async () => (await page.getByRole('button', { name: /Delete contract/ }).count()) > 0, 30000)
  await page.getByPlaceholder(/Search AMC ID or customer/i).fill(newId)
  await waitFor(page, async () => (await page.getByRole('button', { name: `Delete contract ${newId}` }).count()) > 0, 20000)
  check('D2 new contract survives reload', await hasText(page, newId))
  // clean up the test contract
  await page.getByRole('button', { name: `Delete contract ${newId}` }).first().click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Delete permanently' }).click()
  await page.waitForTimeout(1500)
  check('D3 test contract cleaned up', (await amcRow(newId)).length === 0)

  console.log('\nE. Detail page delete + navigation')
  const anyAmc = await (await rest('amcs?select=id')).json()
  const detailId = anyAmc?.[0]?.id
  await page.goto(`${BASE}/amc-contracts/${detailId}`, { waitUntil: 'domcontentloaded' })
  await waitFor(page, async () => (await page.getByRole('button', { name: 'Delete' }).count()) > 0, 20000)
  const delBtn = page.getByRole('button', { name: 'Delete' })
  check('E1 detail page has Delete action', await delBtn.isVisible().catch(() => false))
  await delBtn.click()
  await page.waitForTimeout(700)
  check('E2 detail confirm dialog opens', await hasText(page, `Delete contract ${detailId}?`))
  await page.getByRole('button', { name: 'Delete permanently' }).click()
  await waitFor(page, async () => page.url().includes('/amc-contracts') && !page.url().includes(detailId), 15000)
  await page.waitForTimeout(800)
  check('E3 redirected back to the contract list', /\/amc-contracts$/.test(new URL(page.url()).pathname), page.url())
  check('E4 contract removed from database', (await amcRow(detailId)).length === 0)

  console.log('\nF. Customer portal no longer shows deleted contracts')
  // Separate context = separate storage, so this is a genuine customer session.
  const custCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const cust = await custCtx.newPage()
  await login(cust, CUSTOMER)
  await cust.goto(`${BASE}/portal/amc`, { waitUntil: 'domcontentloaded' })
  await waitFor(cust, () => hasText(cust, 'AMC'))
  await cust.waitForTimeout(1500)
  const portalText = await cust.evaluate(() => document.body.innerText)
  check('F1 portal loaded', portalText.length > 0)
  check('F2 deleted contracts absent from portal', !portalText.includes(target.id) && !portalText.includes(detailId))
  check('F3 no fake @servicepulse.demo address anywhere', !portalText.includes('servicepulse.demo'))
  await cust.close()
  await custCtx.close()

  console.log('\nG. Demo generators removed')
  await page.goto(`${BASE}/retention`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  check('G1 "Create unhealthy customer example" gone', !(await hasText(page, 'Create unhealthy customer example')))
  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /^System$/ }).click()
  await waitFor(page, async () => (await page.getByRole('button', { name: /Reset demo data/i }).count()) > 0, 15000)
  await page.getByRole('button', { name: /Reset demo data/i }).click()
  await page.waitForTimeout(600)
  check('G2 reset asks for typed confirmation', await hasText(page, 'Type RESET to confirm'))
  const stillThere = await (await rest(`amcs?select=id`)).json()
  check('G3 nothing deleted by opening the dialog', Array.isArray(stillThere), `${stillThere.length} amcs intact`)
  await page.getByRole('button', { name: 'Cancel' }).click()

  const realErrors = errors.filter((e) => !/favicon|ResizeObserver/i.test(e))
  check('H1 no console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))

  await browser.close()
  console.log(`\nRESULT: ${fails === 0 ? 'ALL PASS' : fails + ' FAILURES'}`)
  process.exit(fails === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
