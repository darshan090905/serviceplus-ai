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
const waitFor = async (page, fn, ms = 15000, step = 300) => {
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

// seed a fresh assignment email for Upendra
const cust = (await sb('customers?select=id&limit=1'))[0]
const nid = 'DEL-' + String(Date.now()).slice(-8)
await sb('complaints', { method: 'POST', body: JSON.stringify({ id: nid, customer_id: cust.id, category: 'Product', description: 'Verify email delete 2', severity: 'Low', status: 'Open', assigned_to: '', created: new Date().toISOString() }) })

await p1.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p1.locator('input[type=email]').first().fill('darshan.sirpi@gmail.com')
await p1.locator('input[type=password]').first().fill('admin123')
await p1.getByRole('button', { name: /Sign in as admin/i }).click()
await p1.waitForURL(/dashboard/, { timeout: 45000 })
await p1.getByText('Complaints', { exact: true }).first().click()
await p1.waitForURL(/complaints/, { timeout: 15000 })
await p1.waitForTimeout(3000)
const sels = p1.locator('select[aria-label^="Assign technician for "]')
await waitFor(p1, () => sels.count().then((n) => n > 0).catch(() => false), 15000)
let chosen = null
for (let i = 0; i < (await sels.count()); i++) {
  const lbl = await sels.nth(i).getAttribute('aria-label').catch(() => '')
  if (lbl?.includes(nid)) { chosen = sels.nth(i); break }
}
if (!chosen) throw new Error('fresh complaint not assignable')
await chosen.selectOption('Upendra Raj')
await p1.waitForTimeout(3500)

const callsAfterAssign = await sb('outbox_calls?select=id,to_name,complaint_id,status&to_name=eq.Upendra Raj')
console.log('  calls after assignment:', JSON.stringify(callsAfterAssign))

const before = await sb('outbox_emails?select=id,recipient&recipient=eq.Upendra Raj&order=sent_at.desc')
console.log(`  Upendra emails before: ${before.length}`)
check('A. assignment email exists', before.length > 0)

await p2.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
p2.on('console', (m) => { const t = m.text(); if (/error|supabase|RLS|permission/i.test(t)) console.log('  [p2 console]', t.slice(0, 300)) })
p2.on('pageerror', (e) => console.log('  [p2 pageerror]', String(e).slice(0, 300)))
await p2.evaluate(() => { const x = JSON.stringify({ name: 'Upendra Raj', email: 'darshanpatgar80@gmail.com', role: 'technician', technicianId: 'Upendra Raj' }); localStorage.setItem('sp-session', x); sessionStorage.setItem('sp-session', x) })
await p2.goto(`${BASE}/tech/inbox`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p2.waitForTimeout(5000)

const uiCount = () => p2.locator('span.truncate', { hasText: 'New problem assigned to you' }).count()
const uiCalls = () => p2.locator('span.truncate', { hasText: 'New assignment ·' }).count()
const uiBefore = await uiCount()
console.log(`  UI emails: ${uiBefore}, UI calls: ${await uiCalls()}`)
check('B. emails visible in UI', uiBefore > 0)

// per-row delete of the NEWEST email (created for this run)
const targetId = before[0].id
const targetRow = p2.locator('li', { has: p2.locator('span.truncate', { hasText: 'New problem assigned to you' }).first() }).first()
const trash = targetRow.getByRole('button', { name: /Delete email/ })
check('C. trash button visible', await trash.isVisible().catch(() => false))
await trash.click()
const uiAfter = await waitFor(p2, async () => (await uiCount()) < uiBefore)
check('D. row removed from UI', uiAfter, `${uiBefore} -> ${await uiCount()}`)
await p2.waitForTimeout(2500)
const after = await sb('outbox_emails?select=id,recipient&recipient=eq.Upendra Raj')
const removed = before.filter((x) => !after.some((y) => y.id === x.id)).map((x) => x.id)
check('E. exactly one DB row removed', after.length === before.length - 1, `${before.length} -> ${after.length}`)
check('F. removed row is the DEL assignment', removed.length === 1 && removed[0] === targetId, `removed=${JSON.stringify(removed)} target=${targetId}`)

// clear-all on AI Call Log only (safer)
const cBefore = await uiCalls()
check('G. calls visible in UI', cBefore > 0)
await p2.getByRole('button', { name: 'Clear all' }).nth(1).click()
await waitFor(p2, async () => (await uiCalls()) === 0, 15000)
await p2.waitForTimeout(2500)
const cDb = await sb('outbox_calls?select=id&to_name=eq.Upendra Raj')
check('H. Clear all removed calls from DB', cDb.length === 0, `db=${cDb.length}`)

await b.close()
console.log(fails === 0 ? '\nRESULT: ALL PASS' : `\nRESULT: ${fails} FAILURE(S)`)
process.exit(fails === 0 ? 0 : 1)