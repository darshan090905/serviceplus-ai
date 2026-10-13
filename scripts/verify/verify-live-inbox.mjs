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
  const r = await fetch(`${SB_URL}/rest/v1/${p}`, { method: opts.method ?? 'GET', headers: opts.method ? { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' } : H, body: opts.body })
  if (!r.ok) throw new Error(`sb ${p} -> ${r.status}`)
  return opts.method ? null : r.json()
}
const waitFor = async (page, fn, ms = 18000, step = 400) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { if (await fn()) return true } catch { /* retry */ }
    await page.waitForTimeout(step)
  }
  return false
}
let fails = 0
const check = (n, ok, extra = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`); if (!ok) fails++ }

const desc = (await sb('complaints?id=eq.CMP-506&select=description'))[0].description

const b = await chromium.launch({ executablePath: EDGE, headless: true })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p1 = await ctx.newPage() // admin
const p2 = await ctx.newPage() // technician Upendra Raj

await p1.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p1.locator('input[type=email]').first().fill('darshan.sirpi@gmail.com')
await p1.locator('input[type=password]').first().fill('admin123')
await p1.getByRole('button', { name: /Sign in as admin/i }).click()
await p1.waitForURL(/dashboard/, { timeout: 45000 })

// tech tab ALREADY open on the inbox
await p2.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p2.evaluate(() => { const x = JSON.stringify({ name: 'Upendra Raj', email: 'darshanpatgar80@gmail.com', role: 'technician', technicianId: 'Upendra Raj' }); localStorage.setItem('sp-session', x); sessionStorage.setItem('sp-session', x) })
await p2.goto(`${BASE}/tech/inbox`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p2.waitForTimeout(5000)

const countEmail = () => p2.locator('ul li span.truncate', { hasText: 'New problem assigned to you' }).count()
const countCall = () => p2.locator('ul li span.truncate', { hasText: 'New assignment · CMP-' }).count()
const beforeEmail = await countEmail()
const beforeCall = await countCall()
console.log(`  baseline: emails=${beforeEmail} calls=${beforeCall}`)

// admin assigns CMP-506 -> Upendra Raj
await p1.goto(`${BASE}/complaints`, { waitUntil: 'domcontentloaded', timeout: 45000 })
const sel = p1.locator('select[aria-label="Assign technician for CMP-506"]')
await waitFor(p1, () => sel.count().then((n) => n > 0))
await sel.first().selectOption('Upendra Raj')
await p2.waitForTimeout(1500)

// tech page must update WITHOUT any reload (realtime only)
const emailGrew = await waitFor(p2, async () => (await countEmail()) > beforeEmail, 18000)
const callGrew = await waitFor(p2, async () => (await countCall()) > beforeCall, 18000)
check('T1. email appeared live (no reload)', emailGrew, `emails ${beforeEmail} -> ${await countEmail()}`)
check('T2. call appeared live (no reload)', callGrew, `calls ${beforeCall} -> ${await countCall()}`)

// message content: the newest call for Upendra must contain the complaint description
const calls = await sb(`outbox_calls?to_name=eq.Upendra Raj&complaint_id=eq.CMP-506&select=id,message,status&order=created_at.desc&limit=1`)
const newest = calls[0]
check('T3. call message includes customer problem', newest?.message?.includes(desc) ?? false, JSON.stringify(newest?.message?.slice(0, 160) ?? null))

// email row also persisted for the same fresh assignment (realtime requires it)
const emails = await sb(`outbox_emails?recipient=eq.Upendra Raj&select=id,subject,status&subject=ilike.*CMP-506*&order=sent_at.desc&limit=1`)
check('T4. new assignment email persisted', emails[0]?.subject?.includes('CMP-506') ?? false, JSON.stringify(emails[0]?.subject ?? null))

// decline the ringing call so no queued call is left behind
await p2.getByRole('button', { name: 'Decline call' }).click().catch(() => {})

await b.close()
console.log(fails === 0 ? '\nRESULT: ALL PASS' : `\nRESULT: ${fails} FAILURE(S)`)
process.exit(fails === 0 ? 0 : 1)