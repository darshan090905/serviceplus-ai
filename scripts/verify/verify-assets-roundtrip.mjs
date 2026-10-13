// Phase 1 round-trip against the live database, through the real UI.
//
//   A. A machine created in the Equipment Register is actually persisted.
//   B. It appears on the customer's Equipment tab.
//   C. A contract can be pointed at that exact machine, and the pointer is saved.
//   D. Editing the machine updates the row.
//   E. Deleting the machine removes the row and detaches the contract instead of
//      destroying the contract's history.
//
// Everything it touches is either a machine it creates itself or a contract whose
// original asset_id is captured and written back, so the database is left as found.
//   node scripts/tmp-scan/verify-assets-roundtrip.mjs
import { readFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5174'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const ADMIN = { email: 'darshan.sirpi@gmail.com', password: 'admin123' }
const CUSTOMER_ID = 'C-EXAMPLE-1'
const CONTRACT_ID = 'AMC-EXAMPLE-1'
const STAMP = Date.now()
const MACHINE = `Verify Machine ${STAMP}`
const RENAMED = `Verify Machine ${STAMP} Renamed`

let fails = 0
const check = (n, ok, extra = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`); if (!ok) fails++ }
const hasText = (p, t) => p.evaluate((tt) => document.body.innerText.includes(tt), t)
const waitFor = async (page, fn, ms = 25000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { if (await fn()) return true } catch { }
    await page.waitForTimeout(400)
  }
  return false
}

// Same idea, but for a database assertion. The app clears its local row list
// synchronously and writes to Postgres in the background, so sampling the REST
// API once straight after a click races the very write it is trying to verify —
// it reported a healthy delete as "1 rows left". Poll the row count instead of
// trusting a single read.
const waitForDb = async (page, path, predicate, ms = 25000) => {
  const end = Date.now() + ms
  let last
  while (Date.now() < end) {
    try {
      const rows = await (await rest(path)).json()
      last = Array.isArray(rows) ? rows.length : rows
      if (predicate(rows)) return true
    } catch { }
    await page.waitForTimeout(400)
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
const rest = (path, init = {}) =>
  fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })

const assetRow = async () => (await (await rest(`assets?select=*&name=eq.${encodeURIComponent(MACHINE)}`)).json())[0]
const amcRow = async () => (await (await rest(`amcs?select=id,asset_id&id=eq.${CONTRACT_ID}`)).json())[0]

let createdAssetId = null
let originalAssetId = undefined

const browser = await chromium.launch({ executablePath: EDGE, headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))

try {
  const before = await amcRow()
  originalAssetId = before?.asset_id ?? null
  check('target contract exists and its original machine is captured', Boolean(before), `original asset_id = ${JSON.stringify(originalAssetId)}`)

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"]', ADMIN.email)
  await page.fill('input[type="password"]', ADMIN.password)
  await page.click('button[type="submit"]')
  if (!await waitFor(page, () => hasText(page, 'Priority Actions') || hasText(page, 'Dashboard'))) throw new Error('login failed')
  await page.waitForTimeout(1500)

  // A. Create the machine through the register.
  await page.goto(`${BASE}/assets`, { waitUntil: 'domcontentloaded' })
  await waitFor(page, () => hasText(page, 'Equipment Register'))
  await page.getByRole('button', { name: /Add Machine/ }).first().click()
  await page.waitForTimeout(600)

  // The customer select is the first select in the machine form.
  const selects = page.locator('[role="dialog"] select')
  await selects.nth(0).selectOption(CUSTOMER_ID)
  await page.fill('[role="dialog"] input[placeholder*="Split AC"]', MACHINE)
  // Exact placeholders: the model's placeholder ("Voltas 1.5 Ton 3 Star") also
  // contains "Ton", so a substring match writes the capacity into the wrong field.
  await page.fill('[role="dialog"] input[placeholder="Voltas 1.5 Ton 3 Star"]', 'Verify Model X')
  await page.fill('[role="dialog"] input[placeholder="Serial / UID"]', `SN-${STAMP}`)
  await page.fill('[role="dialog"] input[placeholder="1.5 Ton"]', '2 Ton')
  await page.getByRole('button', { name: /^Add Machine$/ }).last().click()

  const listed = await waitFor(page, () => hasText(page, MACHINE))
  check('A. new machine appears in the register', listed)

  // PostgREST caches the schema, so a policy created seconds ago can still be
  // rejected or briefly invisible. Poll for the row before judging the write.
  let row = null
  for (let i = 0; i < 10; i++) {
    row = await assetRow()
    if (row) break
    await page.waitForTimeout(2000)
  }
  createdAssetId = row?.id ?? null
  check('A. machine row is really in the database', Boolean(row), row ? `id = ${row.id}` : 'no row after 20s')
  if (!createdAssetId) throw new Error('machine was never persisted, so the remaining checks would be meaningless')
  {
    check('A. stored fields match what was typed', row.model === 'Verify Model X' && row.serial_no === `SN-${STAMP}` && row.capacity === '2 Ton' && row.customer_id === CUSTOMER_ID,
      `${row.model} / ${row.serial_no} / ${row.capacity} / ${row.customer_id}`)
    check('A. machine starts out Active', row.status === 'Active', row.status)
  }

  // B. Customer-scoped view.
  await page.goto(`${BASE}/customers/${CUSTOMER_ID}`, { waitUntil: 'domcontentloaded' })
  await waitFor(page, () => hasText(page, 'Overview'))
  await page.getByRole('tab', { name: 'Equipment' }).first().click()
  const onCustomerTab = await waitFor(page, () => hasText(page, MACHINE))
  check('B. machine shows on the customer Equipment tab', onCustomerTab)

  // C. Point a contract at it.
  await page.goto(`${BASE}/amc-contracts`, { waitUntil: 'domcontentloaded' })
  await waitFor(page, () => hasText(page, 'AMC Contracts'))
  await page.locator(`button[aria-label="Edit contract ${CONTRACT_ID}"]`).first().click()
  await page.waitForTimeout(700)
  const picker = page.locator('#amc-asset')
  const optionCount = await picker.locator('option').count()
  check('C. contract machine picker lists the new machine', optionCount > 1, `${optionCount} options`)
  const labels = await picker.locator('option').allTextContents()
  check('C. picker shows machine name and capacity, not a raw id', labels.some((l) => l.includes(MACHINE) && l.includes('2 Ton')), labels.join(' | ').slice(0, 140))
  await picker.selectOption(createdAssetId)
  await page.getByRole('button', { name: /Save Changes/ }).click()
  await page.waitForTimeout(1200)
  if (!createdAssetId) throw new Error('no persisted machine id to link')
  const linked = await amcRow()
  check('C. contract now points at that machine in the database', Boolean(createdAssetId) && linked?.asset_id === createdAssetId, `asset_id = ${linked?.asset_id}`)

  // The detail page must show the machine, not the id.
  await page.goto(`${BASE}/amc-contracts/${CONTRACT_ID}`, { waitUntil: 'domcontentloaded' })
  const onDetail = await waitFor(page, () => hasText(page, MACHINE))
  check('C. contract detail shows the machine name', onDetail)

  // D. Edit the machine.
  await page.goto(`${BASE}/assets`, { waitUntil: 'domcontentloaded' })
  await waitFor(page, () => hasText(page, MACHINE))
  const rowLocator = page.locator('tr', { hasText: MACHINE }).first()
  await rowLocator.getByRole('button', { name: /Edit/ }).click()
  await page.waitForTimeout(600)
  await page.fill('[role="dialog"] input[placeholder*="Split AC"]', RENAMED)
  await page.getByRole('button', { name: /Save Changes/ }).click()
  const renamed = await waitFor(page, () => hasText(page, RENAMED))
  check('D. edited name shows in the register', renamed)
  const afterEdit = await (await rest(`assets?select=*&id=eq.${createdAssetId}`)).json()
  check('D. edit is persisted, not just local state', afterEdit[0]?.name === RENAMED, afterEdit[0]?.name ?? 'row missing')

  // E. Delete it and confirm the contract survives, detached.
  const renamedRow = page.locator('tr', { hasText: RENAMED }).first()
  await renamedRow.getByRole('button', { name: /Remove/ }).click()
  await page.waitForTimeout(600)
  const warned = await waitFor(page, () => hasText(page, 'detached from this machine'))
  check('E. delete warns that the contract is kept but detached', warned)
  await page.getByRole('button', { name: /Remove machine/ }).click()
  // Count rows, not page text: the success toast names the machine, so a
  // body-text check would read the name long after the row is gone.
  const gone = await waitFor(page, async () => (await page.locator('tr', { hasText: RENAMED }).count()) === 0)
  check('E. machine disappears from the register', gone)
  const rowsLeft = await waitForDb(page, `assets?select=id&id=eq.${createdAssetId}`, (r) => Array.isArray(r) && r.length === 0)
  const afterDelete = await (await rest(`assets?select=id&id=eq.${createdAssetId}`)).json()
  check('E. machine row is really deleted from the database', rowsLeft && afterDelete.length === 0, `${afterDelete.length} rows left`)
  const contractAfter = await amcRow()
  check('E. contract still exists after the machine is removed', Boolean(contractAfter), `id = ${contractAfter?.id}`)
  check('E. contract was detached rather than deleted', !contractAfter?.asset_id, `asset_id = ${JSON.stringify(contractAfter?.asset_id)}`)

  const unhandled = pageErrors.filter((m) => !/Failed to load resource|404/i.test(m))
  check('no unhandled page exceptions', unhandled.length === 0, unhandled.join(' | '))
} catch (err) {
  check('harness ran to completion', false, String(err).slice(0, 220))
} finally {
  // Leave the database exactly as it was found.
  try {
    if (createdAssetId) {
      await rest(`amcs?asset_id=eq.${createdAssetId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ asset_id: originalAssetId || null }) })
      await rest(`assets?id=eq.${createdAssetId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    }
    const leftover = await (await rest(`assets?select=id&name=like.${encodeURIComponent('Verify Machine%')}`)).json()
    if (leftover.length) {
      await rest(`assets?name=like.${encodeURIComponent('Verify Machine%')}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    }
    await rest(`amcs?id=eq.${CONTRACT_ID}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ asset_id: originalAssetId || null }) })
  } catch (e) {
    console.log('  cleanup warning:', String(e).slice(0, 160))
  }
  await browser.close()
}

const residual = await (await rest(`assets?select=id&name=like.${encodeURIComponent('Verify Machine%')}`)).json()
check('no fixture machines left behind', residual.length === 0, `${residual.length} left`)
const finalAmc = await amcRow()
check('contract machine pointer restored', (finalAmc?.asset_id ?? null) === originalAssetId, `${JSON.stringify(finalAmc?.asset_id)} vs ${JSON.stringify(originalAssetId)}`)

console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`)
process.exit(fails === 0 ? 0 : 1)
