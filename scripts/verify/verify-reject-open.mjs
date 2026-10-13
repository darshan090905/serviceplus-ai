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
await p2.evaluate((v) => { const x = JSON.stringify(v); localStorage.setItem('sp-session', x); sessionStorage.setItem('sp-session', x) }, { name: tech.name, email: tech.email, role: 'technician', technicianId: tech.technician_id ?? tech.name })
await p2.goto(`${BASE}/tech`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p2.waitForTimeout(2500)

// assign -> rings -> decline
await p1.goto(`${BASE}/complaints`, { waitUntil: 'domcontentloaded', timeout: 45000 })
const sel = p1.locator(`select[aria-label="Assign technician for ${complaint.id}"]`)
await waitFor(p1, () => sel.count().then((n) => n > 0))
await sel.first().selectOption(tech.name)
await p2.goto(`${BASE}/tech`, { waitUntil: 'domcontentloaded', timeout: 45000 })
const ov = p2.getByRole('dialog', { name: 'Incoming AI call' })
const rang = await waitFor(p2, () => ov.isVisible().catch(() => false))
check('A. rings', rang)
await p2.getByRole('button', { name: 'Decline call' }).click()
await p2.waitForTimeout(1200)
check('B. overlay gone after decline', !(await ov.isVisible().catch(() => false)))

// tech complaints list: the complaint must still show, status Open
await p2.goto(`${BASE}/tech/complaints`, { waitUntil: 'domcontentloaded', timeout: 45000 })
const rowVisible = await waitFor(p2, () => p2.getByText(complaint.id, { exact: true }).first().isVisible().catch(() => false))
// find Open badge near the row
const openBadges = await p2.getByText('Open', { exact: true }).count().catch(() => 0)
const row = p2.locator('tr, [class*="rounded-xl"]').filter({ hasText: complaint.id }).first()
const rowHasOpen = await waitFor(p2, () => row.getByText('Open', { exact: true }).count().then((n) => n > 0).catch(() => false), 8000).catch(() => false)
check('C. complaint still listed on tech page', rowVisible, `openBadges=${openBadges}`)
check('D. complaint still shows Open after reject', rowHasOpen)

const db = (await sb(`complaints?id=eq.${complaint.id}&select=id,status,assigned_to`))[0]
check('E. DB status remains Open + assigned', db?.status === 'Open' && db?.assigned_to === tech.name, JSON.stringify(db))

await b.close()
console.log(fails === 0 ? '\nRESULT: ALL PASS' : `\nRESULT: ${fails} FAILURE(S)`)
process.exit(fails === 0 ? 0 : 1)