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
  const r = await fetch(`${SB_URL}/rest/v1/${p}`, {
    method: opts.method ?? 'GET',
    headers: { ...H, ...(opts.method ? { 'Content-Type': 'application/json', Prefer: 'return=minimal' } : {}) },
    body: opts.body,
  })
  if (!r.ok) throw new Error(`sb ${p} -> ${r.status}`)
  return opts.method ? null : r.json()
}
const seed = (page, s) => page.evaluate((v) => { const x = JSON.stringify(v); localStorage.setItem('sp-session', x); sessionStorage.setItem('sp-session', x) }, s)
const waitFor = async (page, fn, ms = 20000, step = 400) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { if (await fn()) return true } catch { /* retry */ }
    await page.waitForTimeout(step)
  }
  return false
}
let fails = 0
const check = (n, ok, extra = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`); if (!ok) fails++ }

const tech = (await sb('profiles?role=eq.technician&status=eq.active&select=name,email,technician_id&limit=1'))[0]
const complaint = (await sb('complaints?status=eq.Open&select=id&limit=1'))[0]
console.log('tech:', tech.name, '| complaint:', complaint.id)

const b = await chromium.launch({ executablePath: EDGE, headless: true })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p1 = await ctx.newPage()
const p2 = await ctx.newPage()
await p1.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p1.locator('input[type=email]').first().fill('darshan.sirpi@gmail.com')
await p1.locator('input[type=password]').first().fill('admin123')
await p1.getByRole('button', { name: /Sign in as admin/i }).click()
await waitFor(p1, () => p1.url().includes('/dashboard'))

await p2.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await seed(p2, { name: tech.name, email: tech.email, role: 'technician', technicianId: tech.technician_id ?? tech.name })
await p2.goto(`${BASE}/tech`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p2.waitForTimeout(2500)

const overlay = p2.getByRole('dialog', { name: 'Incoming AI call' })

// --- flow 1: assign -> ring -> Accept -> Connected -> End -> no loop ---
await p1.goto(`${BASE}/complaints`, { waitUntil: 'domcontentloaded', timeout: 45000 })
const sel = p1.locator(`select[aria-label="Assign technician for ${complaint.id}"]`)
await waitFor(p1, () => sel.count().then((n) => n > 0))
await sel.first().selectOption(tech.name)
await p2.goto(`${BASE}/tech`, { waitUntil: 'domcontentloaded', timeout: 45000 })
const r1 = await waitFor(p2, () => overlay.isVisible().catch(() => false))
check('1a. tech portal rings on assignment', r1)
if (r1) {
  await p2.getByRole('button', { name: 'Accept call' }).click()
  const conn = await waitFor(p2, () => p2.getByText('Connected', { exact: true }).isVisible().catch(() => false))
  check('1b. connected card shows after accept', conn)
  const endBtn = await waitFor(p2, () => p2.getByRole('button', { name: 'End call' }).isVisible().catch(() => false), 10000)
  check('1c. End call button present', endBtn)
  await p2.getByRole('button', { name: 'End call' }).click()
  await p2.waitForTimeout(800)
  check('1d. overlay closes after End call', !(await overlay.isVisible().catch(() => false)))
}
const myCalls1 = await sb(`outbox_calls?select=id,status,complaint_id,to_name&to_name=eq.${encodeURIComponent(tech.name)}&complaint_id=eq.${complaint.id}&order=created_at.desc&limit=2`)
check('1e. DB call answered', myCalls1[0]?.status === 'answered', JSON.stringify(myCalls1.map((r) => `${r.id}:${r.status}`)))

// wait 20s -> must NOT re-ring (loop regression part 1)
await p2.waitForTimeout(20000)
check('1f. no re-ring 20s after End call', !(await overlay.isVisible().catch(() => false)))
const myCallsAfterWait = await sb(`outbox_calls?select=id,status&to_name=eq.${encodeURIComponent(tech.name)}&complaint_id=eq.${complaint.id}&order=created_at.desc&limit=3`)
check('1g. DB rows never resurrected to queued', myCallsAfterWait.every((r) => r.status !== 'queued'), JSON.stringify(myCallsAfterWait.map((r) => `${r.id}:${r.status}`)))

// --- flow 2: assign again -> Decline -> missed + admin notification ---
await p1.goto(`${BASE}/complaints`, { waitUntil: 'domcontentloaded', timeout: 45000 })
const sel2 = p1.locator(`select[aria-label="Assign technician for ${complaint.id}"]`)
await waitFor(p1, () => sel2.count().then((n) => n > 0))
await sel2.first().selectOption(tech.name)
await p2.goto(`${BASE}/tech`, { waitUntil: 'domcontentloaded', timeout: 45000 })
const r2 = await waitFor(p2, () => overlay.isVisible().catch(() => false))
check('2a. rings again on second assignment', r2)
if (r2) {
  await p2.getByRole('button', { name: 'Decline call' }).click()
  await p2.waitForTimeout(800)
  check('2b. overlay closes after decline', !(await overlay.isVisible().catch(() => false)))
}
await p2.waitForTimeout(2000)
const myCalls2 = await sb(`outbox_calls?select=id,status&to_name=eq.${encodeURIComponent(tech.name)}&complaint_id=eq.${complaint.id}&order=created_at.desc&limit=2`)
check('2c. DB call missed', myCalls2[0]?.status === 'missed', JSON.stringify(myCalls2.map((r) => `${r.id}:${r.status}`)))

// admin notification visibility
await p1.goto(`${BASE}/notifications`, { waitUntil: 'domcontentloaded', timeout: 45000 })
const notifAnswered = await waitFor(p1, () => p1.getByText('AI call answered', { exact: false }).first().isVisible().catch(() => false), 10000)
const notifMissed = await p1.getByText('AI call missed', { exact: false }).first().isVisible().catch(() => false)
check('3a. admin sees "AI call answered" notification', notifAnswered)
check('3b. admin sees "AI call missed" notification', notifMissed)

// admin settings queue shows the final states
await p1.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p1.getByText('System', { exact: true }).first().click()
await p1.waitForTimeout(1500)
const qAnswered = await p1.getByText('answered', { exact: true }).first().isVisible().catch(() => false)
const qMissed = await p1.getByText('missed', { exact: true }).first().isVisible().catch(() => false)
check('3c. admin call queue shows Answered', qAnswered)
check('3d. admin call queue shows Missed', qMissed)

await b.close()
console.log(fails === 0 ? '\nRESULT: ALL PASS' : `\nRESULT: ${fails} FAILURE(S)`)
process.exit(fails === 0 ? 0 : 1)