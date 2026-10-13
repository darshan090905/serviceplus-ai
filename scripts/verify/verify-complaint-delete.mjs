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
  if (!r.ok) throw new Error(`sb ${path} -> ${r.status}`)
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

const ID = `CMP-DEL-${Date.now()}`
await sb(`complaints?id=like.${encodeURIComponent('CMP-DEL-%')}`, { method: 'DELETE' })
await sb(`outbox_calls?complaint_id=like.${encodeURIComponent('CMP-DEL-%')}`, { method: 'DELETE' })
await sb(`outbox_emails?subject=ilike.${encodeURIComponent('%CMP-DEL-%')}`, { method: 'DELETE' })
await sb(`notifications?link=ilike.${encodeURIComponent('%CMP-DEL-%')}`, { method: 'DELETE' })

const bluefin = (await sb(`customers?select=id&name=eq.Bluefin Hospitality`))[0]
await sb(`complaints`, { method: 'POST', body: JSON.stringify({ id: ID, customer_id: bluefin.id, category: 'Technician', description: 'DELETE TEST complaint', severity: 'High', status: 'Open', assigned_to: '' }) })

const b = await chromium.launch({ executablePath: EDGE, headless: true })
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
p.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)))
p.on('request', (r) => { const u = r.url(); if (u.includes('/rest/v1/') && u.includes(ID)) console.log(`  [req] ${r.method()} ${u.replace(/.+rest\/v1\//, '')}`) })

await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p.locator('input[type=email]').first().fill('darshan.sirpi@gmail.com')
await p.locator('input[type=password]').first().fill('admin123')
await p.getByRole('button', { name: /Sign in as admin/i }).click()
await p.waitForURL(/dashboard/, { timeout: 45000 })
await p.waitForTimeout(3000)
await p.goto(`${BASE}/complaints`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p.waitForTimeout(3000)

check('A1. seeded complaint visible on admin list', await waitFor(p, () => hasText(p, ID)))

// assign to a technician -> creates call + email + notification artifacts
await p.locator('tr', { has: p.getByText(ID) }).first().locator('select').first().selectOption({ label: 'Upendra Raj' })
await p.waitForTimeout(1500)
check('A2. assignment created call artifact', (await sb(`outbox_calls?select=id&complaint_id=eq.${ID}`)).length === 1)
check('A3. assignment created notification', (await sb(`notifications?select=id&link=ilike.${encodeURIComponent('%' + ID + '%')}`)).length >= 1)
check('A4. assignment created email artifact', (await sb(`outbox_emails?select=id&subject=ilike.${encodeURIComponent('%' + ID + '%')}`)).length >= 1)

// delete via admin UI
await p.locator('tr', { has: p.getByText(ID) }).first().locator('input[type=checkbox]').first().check()
check('C1. selection bar appears', await waitFor(p, () => p.getByRole('button', { name: /Delete selected/i }).isVisible().catch(() => false)))
await p.getByRole('button', { name: /Delete selected/i }).click()
check('C2. confirm modal opens', await waitFor(p, () => p.getByRole('button', { name: /Delete permanently/i }).isVisible().catch(() => false)))
await p.getByRole('button', { name: /Delete permanently/i }).click()
check('C3. success toast shown', await waitFor(p, () => hasText(p, 'Deleted 1 complaint')))
console.log('  [dump] ids after delete:', JSON.stringify(await p.locator('tbody tr td:nth-child(2)').allTextContents().catch(() => [])))
console.log('  [dump] id-leftover in innerText:', (await p.evaluate((t) => document.body.innerText.split(t), ID)).length - 1)

// persisted + live-cleared
check('D1. complaint removed from admin list', await waitFor(p, async () => !(await hasText(p, ID)), 20000))
await p.waitForTimeout(1500)
check('D2. complaint row deleted from DB', (await sb(`complaints?select=id&id=eq.${ID}`)).length === 0)
check('D3. call artifact deleted from DB', (await sb(`outbox_calls?select=id&complaint_id=eq.${ID}`)).length === 0)
check('D4. notification deleted from DB', (await sb(`notifications?select=id&link=ilike.${encodeURIComponent('%' + ID + '%')}`)).length === 0)
check('D5. email artifact deleted from DB', (await sb(`outbox_emails?select=id&subject=ilike.${encodeURIComponent('%' + ID + '%')}`)).length === 0)

await b.close()
console.log(fails === 0 ? '\nRESULT: ALL PASS' : `\nRESULT: ${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)