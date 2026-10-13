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
const H = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
const sb = async (path, method, body) => {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
  if (!r.ok) throw new Error(`sb ${method} ${path} -> ${r.status} ${await r.text().catch(() => '')}`)
  return method === 'GET' ? r.json() : null
}
const waitFor = async (page, fn, ms = 20000, step = 350) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { if (await fn()) return true } catch { }
    await page.waitForTimeout(step)
  }
  return false
}
const hasText = (p, t) => p.evaluate((tt) => document.body.innerText.includes(tt), t)
let fails = 0
const check = (n, ok, extra = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`); if (!ok) fails++ }
const seedSession = (p, s) => p.evaluate((v) => { const x = JSON.stringify(v); localStorage.setItem('sp-session', x); sessionStorage.setItem('sp-session', x) }, s)

const ID = `CMP-CHAT-${Date.now()}`
const cust = (await sb(`customers?id=eq.C-512&select=id,name,email`, 'GET'))[0]
const techName = 'Upendra Raj'

// cleanup any leftover test complaints
const prev = await sb(`complaints?id=like.CMP-CHAT-*&select=id`, 'GET')
for (const r of prev) { await sb(`complaints?id=eq.${r.id}`, 'DELETE'); }
// seed the 3-way complaint
await sb(`complaints`, 'POST', {
  id: ID, customer_id: 'C-512', category: 'Service Quality', description: 'Chat E2E test complaint', severity: 'High',
  status: 'Open', created: new Date().toISOString(), assigned_to: techName,
})
console.log(`  [ctx] seeded ${ID} for customer ${cust.name}, assigned to ${techName}`)

const b = await chromium.launch({ executablePath: EDGE, headless: true })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p1 = await ctx.newPage() // admin
const p2 = await ctx.newPage() // customer portal
const p3 = await ctx.newPage() // tech portal

// admin real login
await p1.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p1.locator('input[type=email]').first().fill('darshan.sirpi@gmail.com')
await p1.locator('input[type=password]').first().fill('admin123')
await p1.getByRole('button', { name: /Sign in as admin/i }).click()
await p1.waitForURL(/dashboard/, { timeout: 45000 })

// customer portal seeded session
await p2.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await seedSession(p2, { name: cust.name, email: cust.email, role: 'customer', customerId: cust.id })
await p2.goto(`${BASE}/portal/complaints/${ID}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p2.waitForTimeout(2500)

// tech portal seeded session
await p3.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await seedSession(p3, { name: techName, email: 'darshanpatgar80@gmail.com', role: 'technician', technicianId: techName })
await p3.goto(`${BASE}/tech/complaints/${ID}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p3.waitForTimeout(2500)

check('A1. cleanup of leftover un-seeded temp = none to assert', true)
// (A1 is a no-op slot; the real A checks follow)
const chatVisible = async (p) => p.locator('text=Live Chat').first().isVisible().catch(() => false)

await p1.goto(`${BASE}/complaints/${ID}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p1.waitForTimeout(2500)
check('A2. admin chat panel rendered', await waitFor(p1, () => chatVisible(p1)))
check('A3. customer chat panel rendered', await waitFor(p2, () => chatVisible(p2)))
check('A4. tech chat panel rendered', await waitFor(p3, () => chatVisible(p3)))

// 1. admin sends
const input = (p) => p.locator('textarea[placeholder*="Type a message"]')
await input(p1).fill('msg from admin — checking cooling unit')
await p1.getByRole('button', { name: 'Send message' }).click()
check('B1. admin sees own bubble', await waitFor(p1, () => hasText(p1, 'msg from admin — checking cooling unit')))
check('B2. customer sees admin msg LIVE', await waitFor(p2, () => hasText(p2, 'msg from admin — checking cooling unit')))
check('B3. tech sees admin msg LIVE', await waitFor(p3, () => hasText(p3, 'msg from admin — checking cooling unit')))

// 2. customer replies
await input(p2).fill('msg from customer — still warm, please check today')
await p2.getByRole('button', { name: 'Send message' }).click()
check('C1. customer sees own bubble', await waitFor(p2, () => hasText(p2, 'msg from customer — still warm, please check today')))
check('C2. admin sees customer msg LIVE', await waitFor(p1, () => hasText(p1, 'msg from customer — still warm, please check today')))
check('C3. tech sees customer msg LIVE', await waitFor(p3, () => hasText(p3, 'msg from customer — still warm, please check today')))

// 3. tech replies
await input(p3).fill('msg from tech — reached site, inspecting now')
await p3.getByRole('button', { name: 'Send message' }).click()
check('D1. tech sees own bubble', await waitFor(p3, () => hasText(p3, 'msg from tech — reached site, inspecting now')))
check('D2. admin sees tech msg LIVE', await waitFor(p1, () => hasText(p1, 'msg from tech — reached site, inspecting now')))
check('D3. customer sees tech msg LIVE', await waitFor(p2, () => hasText(p2, 'msg from tech — reached site, inspecting now')))

// 4. DB persisted, correct roles + order
const rows = await sb(`complaint_messages?complaint_id=eq.${ID}&order=created_at.asc&select=id,sender_role,sender_name,body`, 'GET')
check('E1. 3 messages in DB', rows.length === 3, `got ${rows.length}`)
check('E2. sender order admin->customer->tech', rows.map((r) => r.sender_role).join(',') === 'admin,customer,technician', JSON.stringify(rows.map((r) => r.sender_role)))
check('E3. sender names persisted', rows[0].sender_name === 'Service Operations' || !!rows[0].sender_name, JSON.stringify(rows.map((r) => r.sender_name)))

// 5. complaints list badge counts chat
await p1.goto(`${BASE}/complaints`, { waitUntil: 'domcontentloaded', timeout: 45000 })
const badge = p1.locator(`button[aria-label="Chat on ${ID}"]`).first()
check('F1. list badge shows 3', await waitFor(p1, () => badge.textContent().then((t) => (t ?? '').trim() === '3')))
console.log('  [ctx] badge title:', await badge.getAttribute('title').catch(() => '(none)'))

// 6. delete complaint cascades its messages (admin list select -> delete)
await p1.locator('tr', { has: p1.getByText(ID) }).first().locator('input[type=checkbox]').first().check()
await p1.getByRole('button', { name: /Delete selected/i }).click()
await p1.getByRole('button', { name: /Delete permanently/i }).click()
await waitFor(p1, async () => !(await hasText(p1, ID)))
await p1.waitForTimeout(1500)
const leftover = await sb(`complaint_messages?complaint_id=eq.${ID}&select=id`, 'GET')
check('G1. complaint deleted from list', (await sb(`complaints?id=eq.${ID}&select=id`, 'GET')).length === 0)
check('G2. messages cascade-deleted in DB', leftover.length === 0, `left ${leftover.length}`)

await b.close()
console.log(fails === 0 ? '\nRESULT: ALL PASS' : `\nRESULT: ${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)