/**
 * Guards the "does this harness write to the database?" detection in run.mjs.
 *
 * That answer is the only thing standing between somebody and `--e2e` against
 * the live database: run.mjs prints "N detected as database writers" and the
 * read-only ones are the ones you would otherwise feel fine pointing at real
 * data. So a false negative here is not a lint nit, it is a data-loss warning
 * that lies.
 *
 * It already lied once. The detector only matched the supabase-js chain
 * (.from('t').insert()), while a dozen harnesses post to /rest/v1 by hand
 * because they need the service role and `Prefer: return=representation` to read
 * back what they wrote. verify-svc was one of them: it POSTs two service rows
 * and DELETEs by id pattern, and was reported as read-only.
 *
 * So this pins the answer per file rather than testing the regex in isolation,
 * which means a harness that grows a write later cannot slip through by being
 * written in a style the regex does not recognise.
 *
 * Run: node --import tsx scripts/verify/verify-harness-writer-detection.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = resolve(dirname(fileURLToPath(import.meta.url)))
const read = (f) => readFileSync(join(HERE, f), 'utf8')

let fails = 0
let passes = 0
const check = (name, ok, extra = '') => {
  if (ok) { passes++; console.log(`  PASS  ${name}`) }
  else { fails++; console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`) }
}

// Mirrors run.mjs. Kept in step with it deliberately: the point of this harness
// is to fail loudly if the copy and the real thing disagree, so it asserts that
// on the same inputs rather than trusting a shared import that does not exist.
function writesToDb(source) {
  const chain = /\.from\(\s*['"]\w+['"]\s*\)[\s\S]{0,400}?\.\s*(insert|update|upsert|delete)\s*\(/.test(source)
  const rest = /method\s*:\s*['"](POST|PATCH|PUT|DELETE)['"]/.test(source) && /rest\/v1/.test(source)
  const restInferred = /method\s*:\s*['"](POST|PATCH|PUT|DELETE)['"]/.test(source) && /service[_-]?role/i.test(source)
  const rpc = /rpc\(\s*['"]\w*(set|insert|update|delete|reset|purge|seed)\w*/i.test(source)
  return chain || rest || restInferred || rpc
}

const runSrc = read('run.mjs')
check(
  'run.mjs uses the same detection this harness pins',
  runSrc.includes('restInferred') && runSrc.includes("['\"](POST|PATCH|PUT|DELETE)['\"]"),
  'the copy here has drifted from run.mjs — re-sync them',
)

/**
 * The exact regression: harnesses that reach the database through a hand-rolled
 * fetch instead of supabase-js. Every one of these writes, and every one of them
 * was previously reported as read-only.
 */
const RAW_REST_WRITERS = [
  'verify-svc.mjs',              // POST services, DELETE by id pattern
  'verify-honesty.mjs',
  'verify-visits-sla-ui.mjs',
  'verify-call.mjs',
  'verify-amc-edit.mjs',
  'verify-assets-roundtrip.mjs',
  'verify-assets-sync.mjs',
  'verify-clear-notifications.mjs',
  'verify-complaint-delete.mjs',
  'verify-email-delete-db2.mjs',
  'verify-feedback.mjs',
  'verify-satisfaction.mjs',
]

for (const name of RAW_REST_WRITERS) {
  let src
  try { src = read(name) } catch { check(`${name} exists`, false, 'file not found — rename it or drop it from this list'); continue }
  const method = /method\s*:\s*['"](POST|PATCH|PUT|DELETE)['"]/.test(src)
  check(
    `${name} detected as a writer`,
    writesToDb(src),
    method
      ? 'it sends a mutating method but the detector missed it'
      : 'no mutating method found — remove it from this list',
  )
}

// A read-only harness must stay read-only, or the guard is useless: it would
// flag everything and the warning would be ignored.
for (const name of ['verify-stat-tiles.mjs', 'verify-complaint-visit.mjs']) {
  let src
  try { src = read(name) } catch { console.log(`  skip  ${name} (absent)`); continue }
  if (/\bfrom\s+['"]playwright(-core)?['"]/.test(src) || /SUPABASE_SERVICE_ROLE|rest\/v1/.test(src)) {
    check(`${name} detected as read-only`, !writesToDb(src), 'this harness only reads, but was flagged as a writer')
  } else {
    check(`${name} is a pure harness (no browser, no database)`, !writesToDb(src))
  }
}

// Every harness the detector now flags must really contain a write. This is the
// direction that keeps the warning count honest rather than merely larger.
const files = readdirSync(HERE).filter((f) => f.startsWith('verify-') && f.endsWith('.mjs') && f !== 'verify-harness-writer-detection.mjs')
const flagged = files.filter((f) => writesToDb(read(f)))
const withMutatingMethod = files.filter((f) => /method\s*:\s*['"](POST|PATCH|PUT|DELETE)['"]|\.\s*(insert|update|upsert|delete)\s*\(/.test(read(f)))
const missed = withMutatingMethod.filter((f) => !flagged.includes(f))
check(
  'no harness contains a write without being flagged',
  missed.length === 0,
  missed.join(', '),
)
console.log(`         ${flagged.length} of ${files.length} harnesses flagged as writers`)

// The runner reads its verdict out of this line, so it has to be exactly the
// shape run.mjs matches on. A harness that reports "RESULT: ALL PASS" instead
// is counted as failed even when it exits 0, because the count never arrives and
// nothing is compared to zero.
console.log(`  ${passes} passed, ${fails} failed`)
process.exit(fails === 0 ? 0 : 1)
