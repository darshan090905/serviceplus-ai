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
const sb = async (path, opts = {}) => {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method: opts.method ?? 'GET', headers: { ...H, ...(opts.method ? { 'Content-Type': 'application/json', Prefer: 'return=minimal' } : {}) }, body: opts.body })
  if (!r.ok) throw new Error(`sb ${path} -> ${r.status} ${await r.text().catch(() => '')}`)
  return opts.method ? null : r.json()
}
const waitFor = async (page, fn, ms = 15000, step = 300) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { if (await fn()) return true } catch { }
    await page.waitForTimeout(step)
  }
  return false
}
let fails = 0
const check = (n, ok, extra = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`); if (!ok) fails++ }
const hasText = (p, t) => p.evaluate((tt) => document.body.innerText.includes(tt), t)
const notifCount = () => sb(`notifications?select=id`).then((r) => r.length)

// clear slate
await sb(`notifications?id=neq.__all__`, { method: 'DELETE' })

const seed = (id, title) => sb(`notifications`, { method: 'POST', body: JSON.stringify({ id, title, description: `desc-${id}`, time: new Date().toISOString().slice(0, 10), type: 'System', read: false }) })

const b = await chromium.launch({ executablePath: EDGE, headless: true })
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
p.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)))

await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p.locator('input[type=email]').first().fill('darshan.sirpi@gmail.com')
await p.locator('input[type=password]').first().fill('admin123')
await p.getByRole('button', { name: /Sign in as admin/i }).click()
await p.waitForURL(/dashboard/, { timeout: 45000 })
await p.waitForTimeout(3000)
await p.goto(`${BASE}/notifications`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p.waitForTimeout(3000)

// --- page Clear all ---
await seed('N-T1', 'UNIQ-CLEAR-PAGE-1')
check('A1. seeded notification visible', await waitFor(p, () => hasText(p, 'UNIQ-CLEAR-PAGE-1')))
await p.getByRole('button', { name: /Clear all/i }).first().click()
check('A2. confirm modal opens', await waitFor(p, () => p.getByRole('button', { name: /Clear all/i }).filter({ hasText: /Clear all/ }).last().isVisible().catch(() => false).then(async (v) => v)))
await p.locator('div[role=dialog] button').filter({ hasText: 'Clear all' }).click()
check('A3. toast shown', await waitFor(p, () => hasText(p, 'All notifications cleared.')))
check('A4. notification gone from page', await waitFor(p, async () => !(await hasText(p, 'UNIQ-CLEAR-PAGE-1'))))
await p.waitForTimeout(1500)
check('A5. notifications table emptied in DB', (await notifCount()) === 0, `db=${await notifCount()}`)

// --- bell dropdown Clear all ---
await seed('N-T2', 'UNIQ-CLEAR-BELL-1')
await seed('N-T3', 'UNIQ-CLEAR-BELL-2')
await p.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p.waitForTimeout(3000)
check('B1. bell badge shows 2', await waitFor(p, () => p.locator('span').filter({ hasText: '2' }).first().isVisible().catch(() => false)))
await p.locator('button[aria-haspopup=menu]').filter({ has: p.locator('svg.lucide-bell') }).first().click()
await p.waitForTimeout(700)
check('B2. dropdown shows seeded rows', await waitFor(p, () => hasText(p, 'UNIQ-CLEAR-BELL-1')))
const clearBtn = p.locator('div[role=menu] button', { hasText: 'Clear all' })
console.log('  [ctx] menu clear buttons:', await clearBtn.count())
await clearBtn.click()
await p.waitForTimeout(800)
console.log('  [ctx] toast right after click:', await hasText(p, 'All notifications cleared.'))
check('B3. toast shown', await waitFor(p, () => hasText(p, 'All notifications cleared.')))
await p.waitForTimeout(1500)
const after = await notifCount()
check('B4. notifications table emptied in DB', after === 0, `db=${after}`)

// --- per-row delete ---
await seed('N-T4', 'UNIQ-ROW-DEL-1')
await p.goto(`${BASE}/notifications`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p.waitForTimeout(3000)
check('C1. row visible', await waitFor(p, () => hasText(p, 'UNIQ-ROW-DEL-1')))
await p.locator('li').filter({ hasText: 'UNIQ-ROW-DEL-1' }).getByRole('button', { name: /Delete notification/i }).click()
check('C2. row removed from page', await waitFor(p, async () => !(await hasText(p, 'UNIQ-ROW-DEL-1'))))
await p.waitForTimeout(1500)
check('C3. row deleted from DB', (await notifCount()) === 0, `db=${await notifCount()}`)

await b.close()
console.log(fails === 0 ? '\nRESULT: ALL PASS' : `\nRESULT: ${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)