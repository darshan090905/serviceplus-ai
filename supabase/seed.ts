// Minimal Supabase bootstrap.
//
// Creates only the admin Auth user used by the app shell. No demo data,
// customer rows, technician rows, or fake inbox records are inserted.
//
//   npm run db:seed
//
// Reads Supabase URL + anon key from .env.local (or process env).
// Requires SUPABASE_SERVICE_ROLE_KEY (Dashboard → Settings → API →
// service_role) to create auth users. Creates only the admin login:
//   admin   darshan.sirpi@gmail.com / admin123

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  const file = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : ''
  for (const line of file.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/)
    if (match) out[match[1]] = match[2].replace(/^"|"$/g, '')
  }
  return out
}

const env = loadEnv()
const SUPABASE_URL = env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (add to .env.local).')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY)

async function main(): Promise<void> {
  console.log('Seeding ServicePulse admin user only…')
  const { data, error } = await sb.auth.admin.createUser({
    email: 'darshan.sirpi@gmail.com',
    password: 'admin123',
    email_confirm: true,
    app_metadata: { role: 'admin' },
  })

  if (error) {
    if (error.message.toLowerCase().includes('already been registered')) {
      console.log('Admin already exists — nothing to do.')
      return
    }
    console.error(error.message)
    process.exit(1)
  }

  console.log(`Admin ready: ${data.user?.email ?? 'darshan.sirpi@gmail.com'}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})