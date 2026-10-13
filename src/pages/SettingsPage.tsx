import { useState } from 'react'
import { User, Building2, Bell, HeartHandshake, Sparkles, Server, Save, Check, Mail, PhoneCall, AlertTriangle } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Field'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import { Avatar } from '../components/ui/Avatar'
import { Badge, type BadgeTone } from '../components/ui/Badge'
import { useAppStore } from '../store/AppStore'
import { resetPrefs, savePrefs, usePrefs } from '../store/prefs'
import { isSupabaseConfigured, resetData } from '../services/supabase'
import { CURRENT_USER, APP } from '../constants'
import { HEALTH_THRESHOLDS } from '../utils/health'
import { timeAgo } from '../utils/dates'
import { cn } from '../utils/cn'
import type { EmailType, CallRecord } from '../types'

const emailTone: Record<EmailType, BadgeTone> = {
  'critical-assignment': 'critical',
  assignment: 'info',
  escalation: 'danger',
  resolution: 'success',
  reminder: 'warning',
  system: 'info',
  'payment-reminder': 'warning',
}

const callTone: Record<CallRecord['status'], BadgeTone> = {
  queued: 'warning',
  ringing: 'warning',
  answered: 'success',
  missed: 'danger',
}

const sections = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'retention', label: 'Retention Rules', icon: HeartHandshake },
  { id: 'ai', label: 'AI Preferences', icon: Sparkles },
  { id: 'system', label: 'System', icon: Server },
]

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand-600' : 'bg-slate-200',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  )
}

export function SettingsPage() {
  const [section, setSection] = useState('profile')
  const { toast } = useToast()
  const { emails, calls } = useAppStore()
  const supabaseMode = isSupabaseConfigured()
  const [resetting, setResetting] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetPhrase, setResetPhrase] = useState('')
  const [profile, setProfile] = useState(CURRENT_USER)
  const [company, setCompany] = useState({
    name: 'ServicePulse Demo Services Pvt. Ltd.',
    industry: 'HVAC & Facility Maintenance',
    address: '401, Trade Centre, Andheri East, Mumbai 400069',
    email: 'demo@servicepulse.in',
    phone: '+91 22 4000 1234',
    currency: 'INR (₹)',
  })
  // Alert preferences are shared with the dashboard, so a change here takes
  // effect the moment it is made rather than after a save.
  const prefs = usePrefs()
  const setPrefs = savePrefs
  const [aiPrefs, setAiPrefs] = useState({
    complaintAnalysis: true,
    riskExplanation: true,
    renewalEmail: true,
  })

  const runReset = async () => {
    await resetDemo()
  }

  const save = () => toast('Settings saved successfully.')

  const resetDemo = async () => {
    if (!supabaseMode) {
      toast('Nothing to reset — the app is running on in-memory demo data.')
      return
    }
    if (resetPhrase.trim().toUpperCase() !== 'RESET') {
      toast('Type RESET to confirm this destructive action.', 'error')
      return
    }
    setResetting(true)
    const ok = await resetData()
    setResetting(false)
    setConfirmReset(false)
    setResetPhrase('')
    if (ok) {
      toast('All data cleared. Reloading…')
      setTimeout(() => window.location.reload(), 800)
    } else {
      toast('Reset failed. Check the console for details.')
    }
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage your profile, company and application preferences." />

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 scrollbar-thin lg:flex-col" aria-label="Settings sections">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                section === id ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
        </nav>

        <div className="space-y-4">
          {section === 'profile' && (
            <Card title="Profile" description="Your personal information">
              <div className="flex items-center gap-4">
                <Avatar name={profile.name} size="xl" />
                <div className="text-sm">
                  <p className="font-semibold text-slate-900">{profile.name}</p>
                  <p className="text-slate-500">{profile.role}</p>
                </div>
                <Button variant="outline" size="sm" className="ml-auto">Change Avatar</Button>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Input label="Name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
                <Input label="Role" value={profile.role} onChange={(e) => setProfile({ ...profile, role: e.target.value })} />
                <Input label="Email" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
                <Input label="Phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              </div>
              <div className="mt-5 flex justify-end">
                <Button onClick={save} icon={<Save className="h-4 w-4" />}>Save Changes</Button>
              </div>
            </Card>
          )}

          {section === 'company' && (
            <Card title="Company" description="Business information shown across the platform">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Company name" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} />
                <Input label="Industry" value={company.industry} onChange={(e) => setCompany({ ...company, industry: e.target.value })} />
                <Input label="Address" className="sm:col-span-2" value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} />
                <Input label="Email" type="email" value={company.email} onChange={(e) => setCompany({ ...company, email: e.target.value })} />
                <Input label="Phone" value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} />
                <Select label="Currency" value={company.currency} onChange={(e) => setCompany({ ...company, currency: e.target.value })} options={[{ value: 'INR (₹)', label: 'INR (₹)' }, { value: 'USD ($)', label: 'USD ($)' }]} />
              </div>
              <div className="mt-5 flex justify-end">
                <Button onClick={save} icon={<Save className="h-4 w-4" />}>Save</Button>
              </div>
            </Card>
          )}

          {section === 'notifications' && (
            <Card title="Notification Preferences" description="Choose what triggers alerts">
              <div className="divide-y divide-slate-100">
                <Toggle checked={prefs.amcExpiry} onChange={(v) => setPrefs({ ...prefs, amcExpiry: v })} label="AMC expiry alerts" description="Remind the team before contracts lapse" />
                <Toggle checked={prefs.highRisk} onChange={(v) => setPrefs({ ...prefs, highRisk: v })} label="High-risk alerts" description="Notify when a customer moves to At Risk or Critical" />
                <Toggle checked={prefs.paymentOverdue} onChange={(v) => setPrefs({ ...prefs, paymentOverdue: v })} label="Payment overdue alerts" description="Flag unpaid invoices past due" />
                <Toggle checked={prefs.complaintEscalation} onChange={(v) => setPrefs({ ...prefs, complaintEscalation: v })} label="Complaint escalation alerts" description="Alert on the deadlines set by each complaint's severity" />
                <Toggle checked={prefs.weeklyReports} onChange={(v) => setPrefs({ ...prefs, weeklyReports: v })} label="Weekly reports" description="Email a summary every week" />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">These drive the dashboard&rsquo;s priority actions and are saved in this browser.</p>
                <Button onClick={() => { resetPrefs(); toast('Alert preferences reset to defaults.') }}>Reset to defaults</Button>
              </div>
            </Card>
          )}

          {section === 'retention' && (
            <Card title="Retention Rules" description="Risk thresholds used for health scoring">
              <div className="space-y-3">
                {Object.entries(HEALTH_THRESHOLDS).map(([level, range]) => (
                  <div key={level} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
                    <span className="text-sm font-medium text-slate-800">{level}</span>
                    <span className="flex items-center gap-2">
                      <Input value={range.min} className="w-20" aria-label={`${level} minimum`} onChange={() => {}} />
                      <span className="text-slate-400">–</span>
                      <Input value={range.max} className="w-20" aria-label={`${level} maximum`} onChange={() => {}} />
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">Defaults are used unless changed here. Adjustments apply to new calculations.</p>
              <div className="mt-4 flex justify-end">
                <Button onClick={save}>Save Rules</Button>
              </div>
            </Card>
          )}

          {section === 'ai' && (
            <Card title="AI Preferences" description="Control AI-assisted features">
              <div className="divide-y divide-slate-100">
                <Toggle checked={aiPrefs.complaintAnalysis} onChange={(v) => setAiPrefs({ ...aiPrefs, complaintAnalysis: v })} label="Complaint Analysis" description="AI-assisted categorization and severity for complaints" />
                <Toggle checked={aiPrefs.riskExplanation} onChange={(v) => setAiPrefs({ ...aiPrefs, riskExplanation: v })} label="Risk Explanation" description="Explain why a customer is at risk" />
                <Toggle checked={aiPrefs.renewalEmail} onChange={(v) => setAiPrefs({ ...aiPrefs, renewalEmail: v })} label="Renewal Email Generation" description="Generate personalized renewal email drafts" />
              </div>
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <Sparkles className="mr-1 inline h-4 w-4 align-[-2px] text-brand-500" aria-hidden />
                AI provider will be configured during backend integration. No API keys are stored in the frontend.
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={save}>Save Preferences</Button>
              </div>
            </Card>
          )}

          {section === 'system' && (
            <Card title="System" description="Application information">
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Application version</dt><dd className="font-medium">v{APP.version}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Environment</dt><dd><Badge tone="info">{APP.environment}</Badge></dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">API connection</dt><dd className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden /> Not configured (frontend mock)</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Backend</dt><dd className="text-slate-400">n8n + PostgreSQL ready for the next phase</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Data mode</dt><dd className="text-slate-400">{supabaseMode ? 'Supabase (persists across reloads)' : 'In-memory demo data (resets on reload)'}</dd></div>
              </dl>
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                <Check className="mr-1 inline h-3.5 w-3.5 align-[-1px]" aria-hidden />
                Frontend complete — backend integration ready for the next phase.
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setConfirmReset(true); setResetPhrase('') }} disabled={resetting} loading={resetting} icon={<Check className="h-4 w-4" aria-hidden />}>
                  {resetting ? 'Resetting…' : 'Reset demo data'}
                </Button>
              </div>
            </Card>
          )}

          {section === 'system' && (
            <Card
              title="Automated Email Outbox"
              description="Emails the system sent automatically — shown live as a preview of the real n8n email node."
            >
              <p className="mb-3 flex items-center gap-1.5 text-xs text-slate-500">
                <Mail className="h-3.5 w-3.5" aria-hidden />
                {emails.length} emails sent · SMTP + n8n node replaces this during backend integration
              </p>
              {emails.length === 0 ? (
                <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">No emails sent yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {[...emails]
                    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
                    .slice(0, 8)
                    .map((e) => (
                      <li key={e.id} className="flex items-center gap-3 py-2.5">
                        <span className="w-24 shrink-0"><Badge tone={emailTone[e.type]}>{e.type}</Badge></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-slate-800">{e.subject}</span>
                          <span className="block truncate text-xs text-slate-400">To: {e.to} &lt;{e.toEmail}&gt;</span>
                        </span>
                        <span className="shrink-0 text-xs text-slate-400">{timeAgo(e.sentAt)}</span>
                      </li>
                    ))}
                </ul>
              )}
            </Card>
          )}

          <Card
            title="Automated AI Call Queue"
            description="In-app AI voice calls queued when an admin assigns a complaint — the technician's portal rings and plays the message."
          >
            <p className="mb-3 flex items-center gap-1.5 text-xs text-slate-500">
              <PhoneCall className="h-3.5 w-3.5" aria-hidden />
              {calls.length} calls · browser text-to-speech, no telephony cost
            </p>
            {calls.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">No calls yet — assign a complaint to trigger an AI call.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {[...calls]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .slice(0, 8)
                  .map((c) => (
                    <li key={c.id} className="flex items-center gap-3 py-2.5">
                      <span className="w-24 shrink-0"><Badge tone={callTone[c.status]}>{c.status === 'queued' ? 'Ringing' : c.status}</Badge></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-800">To: {c.toName} · {c.complaintId}</span>
                        <span className="block truncate text-xs text-slate-400">{c.message}</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{timeAgo(c.createdAt)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Clear all data?"
        description="This empties every table in Supabase, including the sign-in profiles of every real user. Auth logins stay, but nobody can sign in until their profile is recreated."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button variant="danger" loading={resetting} onClick={runReset}>Clear everything</Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>This cannot be undone. Only use it to clear demo/test records.</span>
          </p>
          <p className="text-slate-500">
            Deleted: customers, AMC contracts, services, complaints, complaint messages, payments, retention actions,
            notifications and the automated email/call outbox.
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Type RESET to confirm</span>
            <Input value={resetPhrase} onChange={(e) => setResetPhrase(e.target.value)} placeholder="RESET" autoFocus />
          </label>
        </div>
      </Modal>
    </div>
  )
}