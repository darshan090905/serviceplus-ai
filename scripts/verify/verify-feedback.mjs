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

const cid = 'CMP-509'
// clear rating so the form appears
await fetch(`${SB_URL}/rest/v1/complaints?id=eq.${cid}`, { method: 'PATCH', headers: H, body: JSON.stringify({ satisfaction: null, feedback: null }) })

const profile = (await (await fetch(`${SB_URL}/rest/v1/customers?id=eq.C-511&select=name,email`, { headers: H })).json())[0]
console.log('customer:', profile.name)

const b = await chromium.launch({ executablePath: EDGE, headless: true })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p1 = await ctx.newPage()
const p2 = await ctx.newPage()
let fails = 0
const check = (n, ok, extra = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`); if (!ok) fails++ }

await p1.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p1.locator('input[type=email]').first().fill('darshan.sirpi@gmail.com')
await p1.locator('input[type=password]').first().fill('admin123')
await p1.getByRole('button', { name: /Sign in as admin/i }).click()
await p1.waitForURL(/dashboard/, { timeout: 45000 })

await p2.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
const s = { name: profile.name, email: profile.email, role: 'customer', customerId: 'C-511' }
await p2.evaluate((v) => { const x = JSON.stringify(v); localStorage.setItem('sp-session', x); sessionStorage.setItem('sp-session', x) }, s)
await p2.goto(`${BASE}/portal/complaints/${cid}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p2.waitForTimeout(2500)

const star4 = p2.getByRole('button', { name: 'Rate 4 out of 5' })
check('A. star buttons visible', await star4.isVisible().catch(() => false))
await star4.click()
await p2.waitForTimeout(600)
// clicking a star must NOT auto-submit
const ratedBadgeBefore = await p2.getByText(/Rated /).count().catch(() => 0)
const toastImmediately = await p2.getByText(/Thanks for your feedback/).first().isVisible().catch(() => false)
check('B. no auto-submit on star click', ratedBadgeBefore === 0 && !toastImmediately)

await p2.getByLabel('Rate 4 out of 5').and(p2.getByRole('button')).click()
await p2.getByRole('button', { name: 'Rate 4 out of 5' }).click()
await p2.locator('textarea').fill('Great service, very prompt.')
const submitBtn = p2.getByRole('button', { name: /Submit rating/ })
check('C. submit button visible', await submitBtn.isVisible().catch(() => false))
await submitBtn.click()
await p2.waitForTimeout(1200)
const rated = await p2.getByText('Rated 4/5', { exact: false }).isVisible().catch(() => false)
const toast = await p2.getByText(/Thanks for your feedback/).first().isVisible().catch(() => false)
const fb = await p2.getByText('Great service, very prompt.').first().isVisible().catch(() => false)
check('D. rating saved (Rated 4/5)', rated)
check('E. confirmation toast shown', toast)
check('F. feedback text saved', fb)

await b.close()

// restore demo data (leave complaint unrated)
await fetch(`${SB_URL}/rest/v1/complaints?id=eq.${cid}`, { method: 'PATCH', headers: H, body: JSON.stringify({ satisfaction: null, feedback: null }) })
console.log(fails === 0 ? '\nRESULT: ALL PASS' : `\nRESULT: ${fails} FAILURE(S)`)
process.exit(fails === 0 ? 0 : 1)