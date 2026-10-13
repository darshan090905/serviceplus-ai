import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

console.log('=== ServicePulse Data Fix ===\n')

console.log('1. Verifying auth users...')
const { data: existingAuth } = await sb.auth.admin.listUsers()
for (const user of existingAuth?.users || []) {
  console.log('  ' + user.email + ' (' + user.id + ')')
}

console.log('\n2. Deduplicating Ravi Kulkarni customers...')
const { data: profiles } = await sb.from('profiles').select('id, customer_id').eq('customer_id', 'C-1026')
console.log('  Profiles pointing to C-1026: ' + JSON.stringify(profiles))
if (profiles && profiles.length) {
  for (const p of profiles) {
    await sb.from('profiles').update({ customer_id: 'C-1025' }).eq('id', p.id)
    console.log('    ' + p.id + ' -> C-1025')
  }
}
const { data: amcs1026 } = await sb.from('amcs').select('id').eq('customer_id', 'C-1026')
console.log('  AMCs under C-1026: ' + (amcs1026 ? amcs1026.length : 0))
for (const a of amcs1026 || []) {
  await sb.from('amcs').update({ customer_id: 'C-1025' }).eq('id', a.id)
  console.log('    AMC ' + a.id + ' -> C-1025')
}
const { error: delErr } = await sb.from('customers').delete().eq('id', 'C-1026')
if (delErr) console.error('  FAIL delete C-1026: ' + delErr.message)
else console.log('  OK Deleted duplicate customer C-1026')

console.log('\n3. Verification...')
const { data: vCustomers } = await sb.from('customers').select('id, name').order('id')
console.log('Customers:', JSON.stringify(vCustomers))
const { data: vProfiles } = await sb.from('profiles').select('id, email, role, status, auth_uid, customer_id').order('id')
for (const p of vProfiles || []) console.log('  ' + p.id + ' ' + p.email + ' ' + p.role + ' ' + p.status + ' auth=' + (p.auth_uid ? 'yes' : 'MISSING') + ' cust=' + p.customer_id)
const { data: vAuth } = await sb.auth.admin.listUsers()
console.log('Auth users: ' + (vAuth?.users.map((u) => u.email + ' (' + (u.email_confirmed_at ? 'confirmed' : 'unconfirmed') + ')').join(', ') || 'none'))

console.log('\nDone!')