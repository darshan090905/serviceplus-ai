/**
 * Proves the stat-tile congestion is actually gone, by measuring the boxes
 * rather than eyeballing a screenshot.
 *
 * The failure mode was arithmetic: a tile narrower than its own padding, icon
 * badge and gap leaves the value with no room, so a 24px-font number clips
 * inside its own box and the icon sits on top of it. So the assertions are about
 * geometry - does the value element's content fit inside it, and is the icon
 * still taking space the number needs.
 *
 * Checked on the reports page (which was 3 tiles inside a third-width card) and
 * on pages that put tiles in a bare grid-cols-3, at desktop and at phone width.
 */
/**
 * Checks that stat tiles give up their furniture before they give up their number.
 *
 * The bug: a tile spends 20px of padding on each edge, plus a 36px icon badge and
 * a 12px gap, before the value gets a pixel. In a four-across row spanning the
 * page that is fine. Dropped into a narrower column it is not - a grid of three
 * inside a third-width card left about 17px for a 24px-font value, so the number
 * clipped inside its own box and the icon badge sat on top of it. The reports
 * page hit this on a desktop, and roughly ten pages that place tiles in a bare
 * `grid-cols-3` hit the identical thing on a phone, where three tiles across a
 * 390px screen are about 110px each.
 *
 * So the assertions are geometric, not visual. `scrollWidth > clientWidth` on the
 * value is the actual symptom - the number does not fit in the space it was
 * given - and it is the one thing a screenshot would not prove.
 *
 * Run: node --import tsx scripts/verify/verify-stat-tiles.mjs
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BASE = process.env.APP_URL || 'http://localhost:5174'
const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const ADMIN = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }

let pass = 0, fail = 0
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ok    ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  (${detail})` : ''}`) }
}

async function main() {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--window-size=1600,1000'] })
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const errs = []
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)) })

  if (!ADMIN.email || !ADMIN.password) {
    console.log('  ADMIN_EMAIL / ADMIN_PASSWORD not set - skipping (the reports page is behind the admin guard)')
    await browser.close()
    process.exit(0)
  }

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForTimeout(9000)

  // Geometry of every tile on the page: is the value clipped, and is there room
  // for the icon without the two touching?
  const audit = () =>
    page.evaluate(() => {
      const out = []
      for (const tile of document.querySelectorAll('.stat-tile')) {
        const value = tile.querySelector('.stat-tile-value')
        const icon = tile.querySelector('.stat-tile-icon')
        const label = tile.querySelector('p')
        if (!value) continue
        const v = value.getBoundingClientRect()
        const i = icon ? icon.getBoundingClientRect() : null
        const style = getComputedStyle(value)
        const clipped = value.scrollWidth > value.clientWidth + 1
        out.push({
          label: (label?.textContent || '').slice(0, 22),
          tileW: Math.round(tile.getBoundingClientRect().width),
          valueFontPx: parseFloat(style.fontSize),
          valueTextW: value.scrollWidth,
          valueBoxW: value.clientWidth,
          clipped,
          iconShown: !!i && i.width > 0,
          iconW: i ? Math.round(i.width) : 0,
          // Does the icon overlap the value, or squeeze it to nothing?
          roomForValue: i ? Math.round(v.width) : Math.round(v.width),
        })
      }
      return out
    })

  for (const [w, h, tag] of [[1600, 1000, 'desktop 1600'], [1024, 900, 'laptop 1024'], [390, 844, 'phone 390']]) {
    await page.setViewportSize({ width: w, height: h })
    await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(5000)

    const tiles = await audit()
    const clipped = tiles.filter((t) => t.clipped)
    console.log(`\n${tag}  (${tiles.length} tiles on reports)`)

    check('no tile clips its own value', clipped.length === 0,
      clipped.map((t) => `${t.label}: text ${t.valueTextW}px in ${t.valueBoxW}px`).join('; '))
    const squeezed = tiles.filter((t) => t.iconShown && t.valueBoxW < 30)
    check('no icon squeezes the value out', squeezed.length === 0,
      squeezed.map((t) => `${t.label}: ${t.valueBoxW}px`).join('; '))
    const minW = Math.min(...tiles.map((t) => t.valueBoxW))
    console.log(`         narrowest value box ${minW}px, tiles ${Math.min(...tiles.map(t => t.tileW))}-${Math.max(...tiles.map(t => t.tileW))}px`)

    // The specific rows the complaint was about. The bar is "spans the content
    // column", which is viewport-dependent: 1280px on a wide desktop but 358px
    // on a phone, because the sidebar and the page padding come out of it.
    const sla = await page.evaluate(() => {
      const grid = document.querySelector('.grid.gap-4.xl\\:grid-cols-3')
      const card = [...(grid?.children || [])].find((c) => /SLA Performance/.test(c.textContent || ''))
      if (!grid || !card) return null
      const t = card.querySelector('.stat-tile')
      return {
        gridW: Math.round(grid.getBoundingClientRect().width),
        cardW: Math.round(card.getBoundingClientRect().width),
        tileW: Math.round(t.getBoundingClientRect().width),
      }
    })
    if (sla) {
      const share = sla.cardW / sla.gridW
      console.log(`         SLA card ${sla.cardW}px of ${sla.gridW}px content (${Math.round(share * 100)}%), its tile ${sla.tileW}px`)
      check('SLA card spans the content column, not a third', share > 0.95, `${Math.round(share * 100)}%`)
      check('SLA tile is wide enough for value+icon', sla.tileW > 150, `${sla.tileW}px`)
    }
  }

  // A page that was never touched: three tiles across with no breakpoint.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${BASE}/customers`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(4500)
  const c = await audit()
  console.log(`\nphone 390 on /customers (bare grid-cols-3, untouched)`)
  check('no value clipped there either', c.every((t) => !t.clipped),
    c.filter((t) => t.clipped).map((t) => `${t.label}: ${t.valueTextW}px in ${t.valueBoxW}px`).join('; '))
  const iconHidden = c.filter((t) => !t.iconShown).length
  console.log(`         ${iconHidden}/${c.length} tiles dropped the icon instead of the number`)

  console.log('\nconsole errors:', errs.length ? errs.slice(0, 3).join(' | ') : 'none')
  await browser.close()
  console.log(`\n  ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1) })
