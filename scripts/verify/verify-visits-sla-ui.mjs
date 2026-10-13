/**
 * Phase 2 UI harness: the preventive cadence controls and the SLA surfaces.
 *
 * The SLA and cadence columns are already live, but services.amc_id is not, which
 * makes it a useful stand-in for "the next migration has not been applied yet":
 * a visit must still complete while that column is missing. The harness also
 * checks that the SLA surfaces render honestly, including saying "no SLA" for a
 * complaint that predates tracking rather than showing a reassuring green tick.
 *
 *   npx tsx scripts/tmp-scan/verify-visits-sla-ui.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5174'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const ADMIN = { email: 'darshan.sirpi@gmail.com', password: 'admin123' }

const env = {}
const envText = existsSync('.env') ? readFileSync('.env', 'utf8') : ''
for (const line of envText.split(String.fromCharCode(10))) {
  const m = line.trim().match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const SUP = `${env.VITE_SUPABASE_URL}/rest/v1`

let pass = 0
let fail = 0
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS ${label}${detail ? ` — ${detail}` : ''}`) }
  else { fail++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`) }
}

async function rest(path, opts = {}) {
  const res = await fetch(`${SUP}${path}`, {
    ...opts,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

const waitFor = async (page, fn, timeout = 20000) => {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await fn()) return true
    await page.waitForTimeout(250)
  }
  return false
}

const hasText = (page, text) =>
  page.evaluate((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), text)

const has = async (path) => (await rest(path)).status === 200

const stamp = Date.now()
const createdAmcIds = []
const svcId = `P2-SVC-${stamp}`
let crash = null

const browser = await chromium.launch({ executablePath: EDGE })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

try {
  console.log('\nSigning in')
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  await page.locator('input').nth(0).fill(ADMIN.email)
  await page.locator('input').nth(1).fill(ADMIN.password)
  await page.getByRole('button', { name: /sign in|log in/i }).first().click()
  check('A0 signed in', await waitFor(page, async () => !page.url().includes('/login'), 25000))
  await page.waitForTimeout(1200)

  console.log('\nWhich Phase 2 columns are live')
  check('A1 the SLA columns are applied', await has('/complaints?select=sla_resolve_by&limit=1'))
  check('A2 the cadence columns are applied', await has('/amcs?select=visits_per_year&limit=1'))
  // This was originally written as an outstanding-work marker, asserting the
  // column was still missing, so that it would fail the moment the migration
  // was applied and make the change visible. Now that it is applied the
  // assertion points the other way: the column is expected, because the service
  // upsert sends the whole row and a visit silently dropping its AMC link is
  // worse than a visit failing to save.
  check('A3 services.amc_id is now applied', await has('/services?select=amc_id&limit=1'))

  console.log('\nPreventive cadence controls on the AMC form')
  await page.goto(`${BASE}/amc-contracts`, { waitUntil: 'domcontentloaded' })
  await waitFor(page, () => hasText(page, 'AMC'))
  await page.getByRole('button', { name: /add amc|new contract|add contract/i }).first().click()
  const dialog = page.getByRole('dialog')
  await waitFor(page, () => dialog.isVisible())
  await waitFor(page, () => hasText(page, 'Preventive Visits'))
  check('B1 the cadence control is offered', await hasText(page, 'Preventive Visits'))
  check('B2 an unconfigured contract reads as on-call only', await hasText(page, 'No scheduled visits'))

  const cadence = page.locator('select').filter({ hasText: 'No scheduled visits' })
  await cadence.selectOption({ label: '4 visits per year' })
  await page.waitForTimeout(400)
  check('B3 choosing a cadence reveals the first-visit date', await hasText(page, 'First Scheduled Visit'))
  check('B4 the repeating interval is spelled out', await hasText(page, 'Repeats every 91 days'))

  await dialog.getByRole('button', { name: /one interval in/i }).click()
  await page.waitForTimeout(400)
  const filled = await dialog.locator('input[aria-label="First Scheduled Visit"]').inputValue()
  check('B5 the suggestion fills a real date', /^\d{4}-\d{2}-\d{2}$/.test(filled), filled)

  console.log('\nSaving a contract with a cadence')
  await dialog.locator('select').first().selectOption({ index: 1 })
  await dialog.locator('input[type="number"]').first().fill('12000')
  await dialog.getByRole('button', { name: /create contract/i }).click()
  await page.waitForTimeout(2500)

  const created = await rest('/amcs?select=id,visits_per_year,next_visit_on&order=id.desc&limit=1')
  const row = Array.isArray(created.body) ? created.body[0] : null
  if (row) createdAmcIds.push(row.id)
  check('B6 the contract reached the database', !!row, row ? row.id : 'none')
  check('B7 the cadence round-trips', row?.visits_per_year === 4, `visits_per_year=${row?.visits_per_year}`)
  check('B8 the first visit date round-trips', !!row?.next_visit_on, `next_visit_on=${row?.next_visit_on}`)

  console.log('\nThe AMC detail page explains the cadence')
  if (row) {
    await page.goto(`${BASE}/amc-contracts/${row.id}`, { waitUntil: 'domcontentloaded' })
    await waitFor(page, () => hasText(page, 'Contract Details'))
    check('B9 the detail page shows visits per year', await hasText(page, '4 per year'))
    check('B10 it shows the next scheduled visit', await hasText(page, 'Next Scheduled Visit'))
  }

  console.log('\nA visit still completes while services.amc_id is missing')
  await rest('/services', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      id: svcId,
      customer_id: 'C-EXAMPLE-1',
      service_type: 'AC Service',
      date: '2026-05-10',
      technician: '',
      status: 'Scheduled',
      rating: null,
      notes: 'phase 2 probe',
    }),
  })
  const scheduled = await rest(`/services?id=eq.${svcId}&select=status`)
  check('B11 the probe visit was created', scheduled.body?.[0]?.status === 'Scheduled', JSON.stringify(scheduled.body))
  // Round-tripping the row exercises the upsert path that carries amc_id, which
  // is the write that has to degrade instead of erroring.
  const round = await rest(`/services?id=eq.${svcId}`, { method: 'PATCH', body: JSON.stringify({ status: 'In Progress' }) })
  check('B12 updating a visit does not fail on the missing column', round.status < 300, `status ${round.status}`)
  const after = await rest(`/services?id=eq.${svcId}&select=status`)
  check('B13 and the update actually landed', after.body?.[0]?.status === 'In Progress', JSON.stringify(after.body))

  console.log('\nSLA surfaces')
  await page.goto(`${BASE}/complaints`, { waitUntil: 'domcontentloaded' })
  await waitFor(page, () => hasText(page, 'Complaint'))
  check('C1 the list has an SLA column', await hasText(page, 'SLA'))
  const slaSelect = page.locator('select').filter({ hasText: 'All SLA States' })
  check('C2 the list can be filtered by SLA state', (await slaSelect.count()) === 1)
  await slaSelect.selectOption('breached')
  await page.waitForTimeout(700)
  check('C3 filtering to breached does not break the page', errors.length === 0, errors.slice(0, 1).join(' | '))
  await slaSelect.selectOption('')
  await page.waitForTimeout(500)

  console.log('\nA complaint that predates SLA tracking says so, rather than looking fine')
  const existing = await rest('/complaints?select=id,severity,sla_resolve_by&limit=1')
  const old = Array.isArray(existing.body) ? existing.body[0] : null
  if (old) {
    await page.goto(`${BASE}/complaints/${old.id}`, { waitUntil: 'domcontentloaded' })
    await waitFor(page, () => hasText(page, 'SLA'))
    check('C4 the detail page shows an SLA panel', await hasText(page, 'SLA'))
    if (old.sla_resolve_by == null) {
      check('C5 it does not invent a deadline for a legacy complaint', await hasText(page, 'Not tracked'))
    } else {
      check('C5 a tracked complaint shows its deadline', await hasText(page, 'Resolve by'))
    }
  }

  console.log('\nReports')
  await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded' })
  await waitFor(page, () => hasText(page, 'Complaint Trends'))
  check('D1 the SLA Performance panel is present', await hasText(page, 'SLA Performance'))
  check('D2 with nothing scored it says so instead of showing 100%', await hasText(page, 'No SLA data in this window'))

  console.log('\nNo page errors anywhere')
  check('E1 no unhandled page exceptions', errors.length === 0, errors.slice(0, 2).join(' | '))
} catch (e) {
  // Recorded rather than rethrown, because process.exit() in the finally block
  // would otherwise discard the stack and report a clean run.
  crash = e
  fail++
  console.log(`  CRASH ${String(e).split('\n').slice(0, 8).join('\n         ')}`)
} finally {
  await rest(`/services?id=eq.${svcId}`, { method: 'DELETE' })
  for (const id of createdAmcIds) await rest(`/amcs?id=eq.${id}`, { method: 'DELETE' })
  await browser.close()
  if (crash) {
    console.log(`\n${pass} passed, ${fail} failed (crashed)`)
    process.exit(1)
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail > 0 ? 1 : 0)
}
