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
    headers: opts.method ? { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' } : H,
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
const b = await chromium.launch({ executablePath: EDGE, headless: true })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p1 = await ctx.newPage() // admin
const p2 = await ctx.newPage() // technician (same context -> shared supabase auth)

const errs = []
for (const p of [p1, p2]) p.on('pageerror', (e) => errs.push((p === p1 ? 'ADMIN ' : 'TECH ') + (e.message ?? e)))

// 1) admin login (real supabase auth)
await p1.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p1.locator('input[type=email]').first().fill('darshan.sirpi@gmail.com')
await p1.locator('input[type=password]').first().fill('admin123')
await p1.getByRole('button', { name: /Sign in as admin/i }).click()
await waitFor(p1, () => p1.url().includes('/dashboard'))
console.log('admin logged in')

// 2) technician session + complaints list
await p2.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await seed(p2, { name: tech.name, email: tech.email, role: 'technician', technicianId: tech.technician_id ?? tech.name })
await p2.goto(`${BASE}/tech/complaints`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await waitFor(p2, () => p2.getByText('Assigned Complaints', { exact: false }).first().isVisible().catch(() => false))
const hrefs = await p2.locator('a[href*="/complaints/"]').evaluateAll((a) => a.map((x) => x.getAttribute('href'))).catch(() => [])
const badHrefs = hrefs.filter((h) => h && !h.startsWith('/tech/complaints/'))
check('all tech View links target /tech/complaints/:id', badHrefs.length === 0, JSON.stringify(badHrefs))
const view = p2.getByText('View', { exact: true }).first()
const clickable = await waitFor(p2, () => view.isVisible().catch(() => false))
check('View link visible', clickable)
if (clickable) {
  await view.click()
  await waitFor(p2, () => p2.url().includes('/tech/complaints/'), 10000)
  await p2.waitForTimeout(2000)
  const detail = await p2.evaluate(() => ({ url: location.pathname, empty: (document.querySelector('main')?.innerText ?? '').trim().length === 0, text: (document.querySelector('main')?.innerText ?? '').slice(0, 90).replace(/\s+/g, ' ') }))
  check('tech View opens a non-blank detail page', detail.url.startsWith('/tech/complaints/') && !detail.empty, `${detail.url} | ${detail.text}`)
}
await b.close()
console.log(fails === 0 ? '\nRESULT: ALL PASS' : `\nRESULT: ${fails} FAILURE(S)`)
process.exit(fails === 0 ? 0 : 1)