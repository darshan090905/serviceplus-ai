#!/usr/bin/env node
/**
 * Test runner.
 *
 * The suite grew one file at a time, which is how it ended up with three
 * genuinely different kinds of check in one directory and no way to run "the
 * tests" as a single safe action. This file sorts them out and refuses to blur
 * the difference, because two of the three kinds touch a real database.
 *
 *   pure  — no server, no browser, no network. Safe to run anywhere, on every
 *           commit. This is what `npm test` runs.
 *   live  — talks to the real Supabase project. Needs .env with credentials.
 *           Mostly read-only: it inspects rows and RLS policies. A few need
 *           temporary fixtures to prove a permission boundary, because "can
 *           user A read user B's row" cannot be checked without two users.
 *           Those announce themselves and the runner prints a warning.
 *   e2e   — drives a real browser against a running dev server, and the app
 *           persists as it goes, so these CREATE, EDIT and DELETE rows in the
 *           live database. Gated behind an explicit flag on purpose: a test
 *           command that quietly wipes somebody's customer data because it was
 *           in the same folder as the arithmetic tests is not a test command.
 *
 * Usage:
 *   node --import tsx scripts/verify/run.mjs            # pure only
 *   node --import tsx scripts/verify/run.mjs --live     # + live read-only
 *   node --import tsx scripts/verify/run.mjs --e2e      # + browser e2e (writes!)
 *   node --import tsx scripts/verify/run.mjs --all
 *   node --import tsx scripts/verify/run.mjs --only ftf gst
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

/**
 * Classify by what a harness actually needs, read from the file rather than
 * from a hand-maintained list, so a new harness cannot silently be assumed safe.
 */
function classify(name, source) {
  if (/\bfrom\s+['"]playwright(-core)?['"]/.test(source)) return 'e2e'
  if (/VITE_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|createClient/.test(source)) return 'live'
  return 'pure'
}

/**
 * An e2e harness that mutates the database. Nothing may escape detection.
 *
 * Two ways a harness reaches the database, and the second one used to be
 * invisible: the supabase-js chain (.from('t').insert(...)), and a hand-rolled
 * fetch against /rest/v1. Most of the older harnesses do the latter, because
 * they need the service role and `Prefer: return=representation` to read back
 * what they wrote. Matching only the supabase-js shape reported twelve of them -
 * including verify-svc, which POSTs services and DELETEs by id pattern - as
 * read-only, so the "N detected as database writers" warning that stands between
 * someone and a --e2e run against live data was quietly wrong.
 */
function writesToDb(source) {
  // supabase-js chains: .from('t') ... .insert|.update|.upsert|.delete(
  const chain = /\.from\(\s*['"]\w+['"]\s*\)[\s\S]{0,400}?\.\s*(insert|update|upsert|delete)\s*\(/.test(source)
  // Raw REST: a mutating method on a request that carries a service-role key.
  const rest = /method\s*:\s*['"](POST|PATCH|PUT|DELETE)['"]/.test(source) && /rest\/v1/.test(source)
  // Raw REST without a literal 'rest/v1', e.g. a URL built from a base constant.
  const restInferred = /method\s*:\s*['"](POST|PATCH|PUT|DELETE)['"]/.test(source) && /service[_-]?role/i.test(source)
  // Mutating RPC by name.
  const rpc = /rpc\(\s*['"]\w*(set|insert|update|delete|reset|purge|seed)\w*/i.test(source)
  return chain || rest || restInferred || rpc
}

function loadEnv() {
  // Harnesses read .env themselves in some cases and rely on process.env in
  // others. Loading both here means `npm test` behaves the same as a shell
  // where somebody remembered to source the files first.
  let loaded = false
  for (const file of ['.env', '.env.local']) {
    const path = join(ROOT, file)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (!m) continue
      if (m[2] === '' || m[1] in process.env) continue
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      loaded = true
    }
  }
  return loaded
}

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const only = args.filter((a) => !a.startsWith('--'))

const wantLive = flag('--live') || flag('--all')
const wantE2e = flag('--e2e') || flag('--all')

const all = readdirSync(HERE)
  .filter((f) => f.startsWith('verify-') && f.endsWith('.mjs'))
  .sort()

const groups = { pure: [], live: [], e2e: [] }
for (const name of all) {
  const source = readFileSync(join(HERE, name), 'utf8')
  groups[classify(name, source)].push({ name, writes: writesToDb(source) })
}

let selected = [...groups.pure]
if (wantLive) selected = selected.concat(groups.live)
if (wantE2e) selected = selected.concat(groups.e2e)
if (only.length) {
  const want = only.map((o) => `verify-${o.replace(/^verify-/, '')}.mjs`)
  selected = all.filter((n) => want.includes(n)).map((n) => ({ name: n, writes: writesToDb(readFileSync(join(HERE, n), 'utf8')) }))
}

if (selected.length === 0) {
  console.error('No harnesses matched.')
  process.exit(1)
}

if (wantLive) {
  const writers = selected.filter((h) => h.writes)
  if (writers.length > 0) {
    console.log('')
    console.log('  [33m!! LIVE MODE !![0m')
    console.log('  These create temporary rows and/or auth users to prove a permission')
    console.log('  boundary, then remove them: ' + writers.map((h) => h.name).join(', '))
    console.log('  Do not point them at a database you mind losing a row to.')
    console.log('')
  }
}

if (wantE2e) {
  const writers = selected.filter((h) => h.writes)
  console.log('')
  console.log('  \u001b[33m!! E2E MODE !!\u001b[0m')
  console.log('  These drive a real browser against a running dev server and the app')
  console.log('  persists as it goes, so they add, edit and delete rows in the LIVE')
  console.log('  database. Start `npm run dev` first, and do not point this at data you')
  console.log('  cannot lose.')
  console.log(`  ${selected.length} harness(es) selected, ${writers.length} detected as database writers.`)
  console.log('')
}

if (selected.some((h) => classify(h.name, readFileSync(join(HERE, h.name), 'utf8')) === 'live')) {
  if (!loadEnv()) {
    console.error('  Missing .env — live harnesses need VITE_SUPABASE_URL and a key.')
    process.exit(1)
  }
}

const results = []
let totalAssertions = 0
let totalFailed = 0

for (const { name } of selected) {
  const started = Date.now()
  // Generous: an e2e run drives a browser and legitimately takes a while, and
  // the alternative to a long timeout is a hung process nobody can interrupt.
  const res = spawnSync(process.execPath, ['--import', 'tsx', join(HERE, name)], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 10 * 60 * 1000,
    env: process.env,
  })
  const output = `${res.stdout || ''}${res.stderr || ''}`
  const match = output.match(/(\d+)\s+passed,\s*(\d+)\s+failed/)
  const passed = match ? Number(match[1]) : null
  const failed = match ? Number(match[2]) : null
  const crashed = res.status !== 0 && !match
  const ms = Date.now() - started

  if (passed != null) {
    totalAssertions += passed + failed
    totalFailed += failed
  }

  // A harness that prints no counts is judged on its exit code instead. It used
  // to be judged as failed outright, because `null === 0` is false - so a
  // harness that reported "RESULT: ALL PASS" and exited 0 was printed with a
  // green "passed" line and then counted red in the summary. The verdict is now
  // the same either way; only the reporting was misleading.
  const unparsed = !match
  const ok = crashed ? false : unparsed ? res.status === 0 : failed === 0
  results.push({ name, ok, passed, failed, crashed, unparsed, ms, tail: crashed || unparsed ? output.trim().split('\n').slice(-4).join(' ') : '' })

  const timing = ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
  const verdict = crashed
    ? `\u001b[31mCRASHED\u001b[0m ${timing}`
    : unparsed
      ? res.status === 0
        ? `\u001b[33mno counts\u001b[0m exited 0, passing on exit code  ${timing}`
        : `\u001b[31mFAILED \u001b[0m exited ${res.status} with no counts  ${timing}`
      : failed > 0
        ? `\u001b[31mFAILED \u001b[0m ${passed} passed, ${failed} failed  ${timing}`
        : `\u001b[32mpassed \u001b[0m ${passed} assertions  ${timing}`
  console.log(`  ${name.replace(/^verify-|\.mjs$/g, '').padEnd(32)} ${verdict}`)
  if (crashed || unparsed) for (const line of results[results.length - 1].tail.split('\n')) console.log(`      ${line}`)
}

const failedRuns = results.filter((r) => !r.ok)
const notSelected = all.length - selected.length

console.log('')
console.log(`  ${results.length} harness(es), ${totalAssertions} assertions, ${totalFailed} failed  ${failedRuns.length ? `\u001b[31m${failedRuns.length} harness(es) red\u001b[0m` : '\u001b[32mall green\u001b[0m'}`)
if (notSelected > 0) {
  const skipped = all.length - results.length
  console.log(`  ${skipped} not run: ${groups.pure.length + groups.live.length + groups.e2e.length} exist in total — add --live for database reads, --e2e for browser tests.`)
}
console.log('')

process.exit(failedRuns.length > 0 ? 1 : 0)
