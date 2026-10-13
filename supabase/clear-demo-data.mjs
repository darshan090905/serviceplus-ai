import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'

function loadEnv() {
  const env = {}
  const file = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : ''
  for (const line of file.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/)
    if (match) env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
  return env
}

const env = loadEnv()
const SUPABASE_URL = env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (add to .env.local).')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

async function deleteTableRows(table) {
  const { error } = await sb.from(table).delete().neq('id', '__no_rows__')
  if (error) throw new Error(`${table}: ${error.message}`)
  console.log(`  cleared ${table}`)
}

async function main() {
  console.log('Clearing ServicePulse demo data…')
  // assets before customers: assets.customer_id has no foreign key, so clearing
  // customers alone would strand machines against customers that no longer exist.
  for (const table of ['retention_actions', 'outbox_emails', 'notifications', 'complaints', 'payments', 'services', 'amcs', 'assets', 'customers', 'profiles']) {
    await deleteTableRows(table)
  }

  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  const keep = new Set(['darshan.sirpi@gmail.com', 'darshan@servicepulse.in'])
  for (const user of data?.users || []) {
    if (user.email && !keep.has(user.email.toLowerCase())) {
      const { error: delError } = await sb.auth.admin.deleteUser(user.id)
      if (delError) throw delError
      console.log(`  deleted auth user ${user.email}`)
    }
  }

  console.log('Done.')
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})