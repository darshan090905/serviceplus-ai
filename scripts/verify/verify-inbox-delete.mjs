import { readFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5174'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const env = {}
for (const line of (existsSync('.env') ? readFileSync('.env', 'utf8') : '').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].trim()
}
const SB_URL = env.VITE_SUPABASE_URL
const SB_SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` }
const sb = async (p, opts = {}) => {
  const r = await fetch(`${SB_URL}/rest/v1/${p}`, { method: opts.method ?? 'GET', headers: { ...H, ...(opts.method ? { 'Content-Type': 'application/json', Prefer: 'return=minimal' } : {}) }, body: opts.body })
  if (!r.ok) throw new Error(`sb ${p} -> ${r.status}`)
  return opts.method ? null : r.json()
}
const waitFor = async (page, fn, ms = 12000, step = 300) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { if (await fn()) return true } catch { /* retry */ }
    await page.waitForTimeout(step)
  }
  return false
}
let fails = 0
const check = (n, ok, extra = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`); if (!ok) fails++ }

const b = await chromium.launch({ executablePath: EDGE, headless: true })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p1 = await ctx.newPage()
const p2 = await ctx.newPage()

await p1.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p1.locator('input[type=email]').first().fill('darshan.sirpi@gmail.com')
await p1.locator('input[type=password]').first().fill('admin123')
await p1.getByRole('button', { name: /Sign in as admin/i }).click()
await p1.waitForURL(/dashboard/, { timeout: 45000 })

await p2.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p2.evaluate(() => { const x = JSON.stringify({ name: 'Upendra Raj', email: 'darshanpatgar80@gmail.com', role: 'technician', technicianId: 'Upendra Raj' }); localStorage.setItem('sp-session', x); sessionStorage.setItem('sp-session', x) })
await p2.goto(`${BASE}/tech/inbox`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p2.waitForTimeout(5000)

const emailCount = () => p2.locator('ul li span.truncate', { hasText: 'New problem assigned to you' }).count()
const callCount = () => p2.locator('ul li span.truncate', { hasText: 'New assignment · CMP-' }).count()
const eBefore = await emailCount()
const cBefore = await callCount()
console.log(`  baseline emails=${eBefore} calls=${cBefore}`)
check('A. email rows present', eBefore > 0)
check('B. call rows present', cBefore > 0)

// --- per-row delete: newest email ---
const firstEmailRow = p2.locator('li', { has: p2.locator('span.truncate', { hasText: 'New problem assigned to you' }).first() }).first()
const delBtn = firstEmailRow.getByRole('button', { name: /Delete email/ })
check('C. per-row email delete button visible', await delBtn.isVisible().catch(() => false))
await delBtn.click()
const eDecreased = await waitFor(p2, async () => (await emailCount()) < eBefore)
check('D. email removed from list', eDecreased, `emails ${eBefore} -> ${await emailCount()}`)
await p2.waitForTimeout(1500)
const eDbAfter = await sb(`outbox_emails?select=id&recipient=eq.Upendra Raj&order=sent_at.desc&limit=3`)
check('E. email row deleted from DB', eDbAfter.length === eBefore - 1, `db=${eDbAfter.length} expected=${eBefore - 1}`)

// --- per-row delete: newest call ---
const firstCallRow = p2.locator('li', { has: p2.locator('span.truncate', { hasText: 'New assignment · CMP-' }).first() }).first()
const cdelBtn = firstCallRow.getByRole('button', { name: /Delete call/ })
check('F. per-row call delete button visible', await cdelBtn.isVisible().catch(() => false))
await cdelBtn.click()
const cDecreased = await waitFor(p2, async () => (await callCount()) < cBefore)
check('G. call removed from log', cDecreased, `calls ${cBefore} -> ${await callCount()}`)
await p2.waitForTimeout(1500)
const cDbBefore = (await sb(`outbox_calls?select=id&to_name=eq.Upendra Raj`)).length
check('H. call row deleted from DB', cDbBefore === cBefore - 1, `db=${cDbBefore} expected=${cBefore - 1}`)

// --- clear all (emails) ---
const clearAll = p2.getByRole('button', { name: 'Clear all' }).first()
check('I. Clear all button present', await clearAll.isVisible().catch(() => false))
await clearAll.click()
await waitFor(p2, async () => (await emailCount()) === 0, 12000)
await p2.waitForTimeout(2000)
const eDbAfterClear = await sb(`outbox_emails?select=id&recipient=eq.Upendra Raj`)
check('J. Clear all removed every email from DB', eDbAfterClear.length === 0, `db=${eDbAfterClear.length}`)

await b.close()
console.log(fails === 0 ? '\nRESULT: ALL PASS' : `\nRESULT: ${fails} FAILURE(S)`)
process.exit(fails === 0 ? 0 : 1)