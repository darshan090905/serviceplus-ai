// Phase 1 pre-migration check: the equipment register must not break the app
// while the assets table is still missing from the live database.
//
// This asserts the honest-degradation path only (page renders, empty state
// shown, console free of unhandled errors). The full create → link → delete
// round-trip needs supabase/migrations/001-assets.sql applied first.
//   node scripts/tmp-scan/verify-assets-premigration.mjs
import { readFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5174'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const ADMIN = { email: 'darshan.sirpi@gmail.com', password: 'admin123' }
let fails = 0
const check = (n, ok, extra = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`); if (!ok) fails++ }

const hasText = (p, t) => p.evaluate((tt) => document.body.innerText.includes(tt), t)
const waitFor = async (page, fn, ms = 25000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { if (await fn()) return true } catch { }
    await page.waitForTimeout(400)
  }
  return false
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

const pageErrors = []
const consoleErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"]', ADMIN.email)
  await page.fill('input[type="password"]', ADMIN.password)
  await page.click('button[type="submit"]')
  // Wait for real dashboard content, not just a URL change: a hard navigation
  // issued before the session settles gets bounced by the auth guard.
  const loggedIn = await waitFor(page, () => hasText(page, 'Priority Actions') || hasText(page, 'Dashboard'))
  check('admin can sign in', loggedIn)
  if (!loggedIn) throw new Error('login failed')
  await page.waitForTimeout(1500)

  // The register must render even though supabase.from('assets') 404s.
  await page.goto(`${BASE}/assets`, { waitUntil: 'domcontentloaded' })
  const rendered = await waitFor(page, () => hasText(page, 'Equipment Register'))
  check('/assets route renders with no assets table', rendered, page.url())

  const stillOnPage = await hasText(page, 'Equipment Register')
  check('page did not fall back to an error screen', stillOnPage)

  // An empty register must say so rather than implying zero coverage forever.
  // The table shows a skeleton for ~400ms first, so wait for the real empty state.
  const honestEmpty = await waitFor(page, () => hasText(page, 'No machines registered yet'))
  check('honest empty state instead of a silent blank table', honestEmpty)

  const canAdd = await hasText(page, 'Add Machine')
  check('add-machine action is still offered', canAdd)

  // Customer record must expose the new Equipment tab and survive the 404.
  await page.goto(`${BASE}/customers`, { waitUntil: 'domcontentloaded' })
  await waitFor(page, () => hasText(page, 'Customers'))
  const firstCustomer = await page.locator('table tbody tr, a[href^="/customers/"]').first()
  await firstCustomer.click()
  const onCustomer = await waitFor(page, () => /\/customers\/.+/.test(page.url()))
  // The customer page shows a skeleton for ~400ms, so wait for real content
  // before asserting on tabs.
  const contentReady = onCustomer && (await waitFor(page, () => hasText(page, 'Overview')))
  check('customer record opens', Boolean(contentReady), page.url())
  if (contentReady) {
    // Assert on the tab strip itself, not the whole page: the sidebar also has an
    // "Equipment" nav link, which would make a page-wide text check a false pass.
    const tabLabels = await page
      .locator('[role="tab"], button')
      .evaluateAll((els) => els.map((e) => (e.textContent || '').trim()).filter(Boolean))
      .catch(() => [])
    const hasTab = tabLabels.includes('Equipment')
    check('customer record shows the Equipment tab', hasTab, tabLabels.join('|').slice(0, 120))
    if (hasTab) {
      const tabClicked = await page
        .getByRole('tab', { name: 'Equipment' })
        .first()
        .click({ timeout: 5000 })
        .then(() => true)
        .catch(() => false)
      const tabOk = tabClicked && (await waitFor(page, () => hasText(page, 'No machines on file')))
      check('customer Equipment tab renders with an honest empty state', Boolean(tabOk))
    }
  }

  // A 404 from PostgREST is expected here; an unhandled exception is not.
  const unhandled = pageErrors.filter((m) => !/Failed to load resource|404|assets/i.test(m))
  check('no unhandled page exceptions', unhandled.length === 0, unhandled.join(' | '))
  const noisy = consoleErrors.filter((m) => !/Failed to load resource|404|assets/i.test(m))
  check('no unexpected console errors', noisy.length === 0, noisy.slice(0, 3).join(' | '))
} catch (err) {
  check('harness ran to completion', false, String(err).slice(0, 200))
} finally {
  await browser.close()
}

console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`)
console.log('Note: this proves graceful degradation only. Run the assets round-trip')
console.log('after applying supabase/migrations/001-assets.sql.')
process.exit(fails === 0 ? 0 : 1)
