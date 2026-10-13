// Verifies the month-based AMC date edit (from month -> to month) on both the
// list and the detail page, and that the change persists to Supabase.
//   node scripts/tmp-scan/verify-amc-edit.mjs
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
const rest = async (p, init = {}) =>
  fetch(SB + '/rest/v1/' + p, {
    ...init,
    headers: { apikey: K, Authorization: 'Bearer ' + K, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
  })
const amcRow = async (id) => (await rest(`amcs?select=id,start_date,end_date,amount,status,renewal_status,customer_id&id=eq.${encodeURIComponent(id)}`)).json()

const login = async (page) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  await page.locator('input').nth(0).fill(ADMIN.email)
  await page.locator('input').nth(1).fill(ADMIN.password)
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await login(page)
  const rows = await (await rest('amcs?select=id&order=id')).json()
  const id = rows?.[0]?.id
  const before = (await amcRow(id))[0]
  console.log(`\nTarget contract ${id}: ${before.start_date} -> ${before.end_date}`)

  console.log('\nA. List page edit')
  await page.goto(`${BASE}/amc-contracts`, { waitUntil: 'domcontentloaded' })
  await waitFor(page, async () => (await page.getByRole('button', { name: /Edit contract/ }).count()) > 0, 30000)
  const editButtons = await page.getByRole('button', { name: /Edit contract/ }).count()
  check('A1 per-row edit button present', editButtons > 0, `${editButtons} buttons`)
  await page.getByPlaceholder(/Search AMC ID or customer/i).fill(id)
  await waitFor(page, async () => (await page.getByRole('button', { name: `Edit contract ${id}` }).count()) > 0, 20000)
  await page.getByRole('button', { name: `Edit contract ${id}` }).first().click()
  await page.waitForTimeout(800)
  const dlg = page.getByRole('dialog')
  check('A2 edit dialog opens for the contract', await hasText(page, `Edit Contract ${id}`))

  const months = dlg.locator('input[type="month"]')
  check('A3 two month pickers instead of raw dates', (await months.count()) === 2, `${await months.count()} inputs`)
  check('A4 no day-level date inputs left', (await dlg.locator('input[type="date"]').count()) === 0)
  const preFrom = await months.nth(0).inputValue()
  const preTo = await months.nth(1).inputValue()
  check('A5 prefilled from the stored period', /^\d{4}-\d{2}$/.test(preFrom) && /^\d{4}-\d{2}$/.test(preTo), `${preFrom} -> ${preTo}`)

  console.log('\nB. Month validation')
  await months.nth(1).fill('2020-01')
  await page.getByRole('button', { name: /Save Changes/i }).click()
  await page.waitForTimeout(700)
  check('B1 ending before starting is rejected', await hasText(page, 'Ending month must be the same as or later'))
  check('B2 dialog stays open on invalid months', await dlg.isVisible().catch(() => false))
  const stillSame = (await amcRow(id))[0]
  check('B3 nothing written to the database', stillSame.start_date === before.start_date && stillSame.end_date === before.end_date)

  console.log('\nC. Valid month range saves exact dates')
  const newFrom = '2027-04'
  const newTo = '2028-03'
  await months.nth(0).fill(newFrom)
  await months.nth(1).fill(newTo)
  await waitFor(page, () => hasText(page, 'Valid 1 Apr 2027 → 31 Mar 2028'), 10000)
  check('C1 preview shows the exact validity period', await hasText(page, 'Valid 1 Apr 2027 → 31 Mar 2028'))
  check('C2 preview states the month count', await hasText(page, '12 months'))
  await page.getByRole('button', { name: /Save Changes/i }).click()
  await waitFor(page, async () => !(await page.getByRole('dialog').isVisible().catch(() => false)), 15000)
  await page.waitForTimeout(1200)
  const saved = (await amcRow(id))[0]
  check('C3 start date = first day of from-month', saved.start_date === '2027-04-01', saved.start_date)
  check('C4 end date = last day of to-month', saved.end_date === '2028-03-31', saved.end_date)
  check('C5 amount untouched', Number(saved.amount) === Number(before.amount), String(saved.amount))

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitFor(page, async () => (await page.getByRole('button', { name: /Edit contract/ }).count()) > 0, 30000)
  check('C6 change survives a reload', await hasText(page, '1 Apr 2027'))

  console.log('\nD. Single-month contract')
  await page.getByPlaceholder(/Search AMC ID or customer/i).fill(id)
  await waitFor(page, async () => (await page.getByRole('button', { name: `Edit contract ${id}` }).count()) > 0, 20000)
  await page.getByRole('button', { name: `Edit contract ${id}` }).first().click()
  await page.waitForTimeout(700)
  const m2 = page.getByRole('dialog').locator('input[type="month"]')
  await m2.nth(0).waitFor({ state: 'visible' })
  await m2.nth(0).fill('2027-09')
  await m2.nth(1).fill('2027-09')
  await page.waitForTimeout(600)
  await waitFor(page, () => hasText(page, 'Valid 1 Sept 2027 → 30 Sept 2027'), 10000)
  check('D1 same month both ends is valid', await hasText(page, 'Valid 1 Sept 2027 → 30 Sept 2027'))
  check('D2 month count is singular', await hasText(page, '1 month.'))
  await page.getByRole('button', { name: /Save Changes/i }).click()
  await waitFor(page, async () => !(await page.getByRole('dialog').isVisible().catch(() => false)), 15000)
  const single = (await amcRow(id))[0]
  check('D3 saved as a one-month contract', single.start_date === '2027-09-01' && single.end_date === '2027-09-30', `${single.start_date} -> ${single.end_date}`)

  console.log('\nE. Detail page edit')
  await page.goto(`${BASE}/amc-contracts/${id}`, { waitUntil: 'domcontentloaded' })
  await waitFor(page, async () => (await page.getByRole('button', { name: 'Edit' }).count()) > 0, 20000)
  await page.getByRole('button', { name: 'Edit' }).first().click()
  await page.waitForTimeout(800)
  check('E1 detail edit dialog opens', await hasText(page, `Edit Contract ${id}`))
  check('E2 detail edit uses month pickers', (await page.getByRole('dialog').locator('input[type="month"]').count()) === 2)
  const m3 = page.getByRole('dialog').locator('input[type="month"]')
  await m3.nth(0).waitFor({ state: 'visible' })
  await m3.nth(0).fill('2026-10')
  await m3.nth(1).fill('2027-09')
  await page.waitForTimeout(600)
  await waitFor(page, () => hasText(page, 'Valid 1 Oct 2026 → 30 Sept 2027'), 10000)
  check('E3 preview for 12-month window', await hasText(page, 'Valid 1 Oct 2026 → 30 Sept 2027'))
  await page.getByRole('button', { name: /Save Changes/i }).click()
  await waitFor(page, async () => !(await page.getByRole('dialog').isVisible().catch(() => false)), 15000)
  await page.waitForTimeout(1000)
  const detail = (await amcRow(id))[0]
  check('E4 detail page shows the new period', await hasText(page, '1 Oct 2026'))
  check('E5 database has the new period', detail.start_date === '2026-10-01' && detail.end_date === '2027-09-30', `${detail.start_date} -> ${detail.end_date}`)

  // restore the original period so the remaining data is untouched
  await rest(`amcs?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ start_date: before.start_date, end_date: before.end_date }),
  })
  const restored = (await amcRow(id))[0]
  check('E6 original period restored for the rest of the suite', restored.start_date === before.start_date && restored.end_date === before.end_date)

  const realErrors = errors.filter((e) => !/favicon|ResizeObserver/i.test(e))
  check('F1 no page errors', realErrors.length === 0, realErrors.slice(0, 2).join(' | '))

  await browser.close()
  console.log(`\nRESULT: ${fails === 0 ? 'ALL PASS' : fails + ' FAILURES'}`)
  process.exit(fails === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
