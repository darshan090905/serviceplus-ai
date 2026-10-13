import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  AMCContract,
  AuthAccount,
  CallRecord,
  CallStatus,
  Complaint,
  ComplaintMessage,
  Customer,
  EmailRecord,
  EmailType,
  EquipmentAsset,
  MessageSenderRole,
  Notification,
  NotificationType,
  Payment,
  RetentionAction,
  RetentionStatus,
  RenewalOffer,
  RiskFactor,
  ServiceRecord,
  Session,
  Role,
} from '../types'
import { technicianEmail, loginWithCredentials, type LoginOutcome } from '../data/auth'
import { buildPendingAccount, register, approve, reject, updateAccount, removeAccount } from '../services/authService'
import { visitForComplaint } from '../utils/dispatch'
import { deleteServiceEvidence } from '../services/jobService'
import { supabase, isSupabaseConfigured, hydrateAll, persistAll, profileToAccount, subscribePayments, subscribeAccounts, subscribeComplaints, subscribeServices, subscribeNotifications, subscribeEmails, subscribeCalls, subscribeMessages, setPaymentReference as setPaymentReferenceDb, updateComplaintDb, updateCustomerDb, updateNotificationDb, deleteNotificationDb, clearNotificationsDb, updateCallDb, updateEmailDb, deleteEmailDb, deleteCallDb, deleteComplaintDb, insertMessageDb, revertPaymentRows, updateProfileRows, deleteAccountRows, deleteCustomerRows, upsertAmcDb, deleteAmcDb, deleteServiceDb, upsertServiceDb, upsertAssetDb, deleteAssetDb, type HydratedData } from '../services/supabase'
import { warnMissingEnv } from '../config'
import { computeHealth } from '../utils/health'
import { slaDeadlinesFor, isBreached } from '../utils/sla'
import { formatINR } from '../utils/format'
import { formatDate, daysFromNow, today } from '../utils/dates'
import { CURRENT_USER } from '../constants'
import type { ServiceTypeKey } from '../types'
import { resolveTechnicianId } from '../utils/technicians'

const SESSION_KEY = 'sp-session'

function makeReferenceId(): string {
  const rand = () => Math.random().toString(36).slice(2, 10)
  return `sp_${Date.now().toString(36)}_${rand()}${rand()}`
}
const STARTER_AMC_AMOUNT: Record<ServiceTypeKey, number> = {
  'AC Service': 12000,
  Refrigeration: 18000,
  HVAC: 36000,
  Elevator: 52000,
  Generator: 46000,
  'Water Purification': 5200,
}

interface AppStore {
  session: Session | null
  /** False until the app has decided whether a stored session exists. Route guards must wait for this instead of treating a null session as "signed out". */
  ready: boolean
  login: (email: string, password: string, expectedRole?: Role) => Promise<LoginOutcome>
  quickLogin: (session: Session) => void
  logout: () => void
  customers: Customer[]
  assets: EquipmentAsset[]
  amcs: AMCContract[]
  services: ServiceRecord[]
  complaints: Complaint[]
  payments: Payment[]
  retention: RetentionAction[]
  notifications: Notification[]
  accounts: AuthAccount[]
  emails: EmailRecord[]
  calls: CallRecord[]
  messages: ComplaintMessage[]
  sendMessage: (complaintId: string, senderRole: MessageSenderRole, body: string) => void
  addCustomer: (customer: Customer) => void
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<boolean>
  // These resolve false when the database refused the write, and undo the
  // optimistic local change so the screen never shows a record that isn't there.
  addAsset: (asset: EquipmentAsset) => Promise<boolean>
  updateAsset: (id: string, updates: Partial<EquipmentAsset>) => Promise<boolean>
  deleteAsset: (id: string) => Promise<boolean>
  addAmc: (amc: AMCContract) => void
  updateAmc: (id: string, updates: Partial<AMCContract>) => void
  addService: (service: ServiceRecord) => void
  updateService: (id: string, updates: Partial<ServiceRecord>) => void
  addComplaint: (complaint: Complaint) => void
  updateComplaint: (id: string, updates: Partial<Complaint>) => void
  assignComplaint: (id: string, technician: string, technicianEmail?: string) => void
  /**
   * Returns the service id backing a complaint, creating the visit first if the
   * complaint predates the link (or was raised before anyone assigned it).
   *
   * Evidence is stored per service, so "add a photo to this complaint" needs a
   * service row to hang the photo off. Without this the only way to attach proof
   * to such a complaint was to go and find it on the schedule first, which is
   * the wrong order when you are standing at the customer's door.
   */
  ensureComplaintVisit: (id: string) => Promise<string | null>
  resolveComplaint: (id: string, resolution: string) => void
  rateComplaint: (id: string, satisfaction: number, feedback?: string) => void
  rateService: (id: string, rating: number) => void
  addPayment: (payment: Payment) => void
  recordPayment: (id: string, updates: Partial<Payment>) => void
  sendPaymentConfirmation: (paymentId: string) => void
  setPaymentReference: (id: string, referenceId: string) => Promise<boolean>
  sendPaymentRequest: (input: { customerId: string; amount: number; dueDate: string; note?: string }) => Promise<{ ok: boolean; payment?: Payment; message?: string }>
  revertPayment: (id: string) => void
  setRetentionStatus: (id: string, status: RetentionStatus) => void
  setRetentionOffer: (id: string, offer: RenewalOffer) => void
  registerAccount: (input: {
    name: string
    email: string
    password: string
    role: Exclude<Session['role'], 'admin'>
    company?: string
    serviceTypes?: ServiceTypeKey[]
    city?: string
  }) => Promise<{ ok: boolean; message?: string }>
  approveAccount: (id: string) => void
  rejectAccount: (id: string, note?: string) => void
  updateAccount: (id: string, updates: { email?: string; password?: string }) => { ok: boolean; message?: string }
  setTechnicianSkills: (id: string, skills: ServiceTypeKey[]) => Promise<{ ok: boolean; message?: string }>
  deleteAccount: (id: string) => Promise<void>
  deleteCustomer: (customerId: string) => Promise<void>
  deleteAmc: (id: string) => Promise<boolean>
  deleteComplaint: (id: string) => Promise<boolean>
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  deleteNotification: (id: string) => void
  clearNotifications: () => void
  markEmailRead: (id: string) => void
  deleteEmail: (id: string) => void
  pushCall: (toName: string, complaintId: string | undefined, message: string) => void
  markCallStatus: (id: string, status: CallStatus) => void
  deleteCall: (id: string) => void
}

const StoreContext = createContext<AppStore | null>(null)

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session
    if (!parsed || !parsed.role) return null
    if (parsed.role === 'technician' && !parsed.technicianId) return null
    if (parsed.role === 'customer' && !parsed.customerId) return null
    if (parsed.role === 'admin') {
      if (!parsed.email || parsed.email === 'darshan@servicepulse.in') {
        parsed.email = CURRENT_USER.email
      }
    }
    return parsed
  } catch {
    return null
  }
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [assets, setAssets] = useState<EquipmentAsset[]>([])
  const [amcs, setAmcs] = useState<AMCContract[]>([])
  const [services, setServices] = useState<ServiceRecord[]>([])
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [retention, setRetention] = useState<RetentionAction[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [accounts, setAccounts] = useState<AuthAccount[]>([])
  const [emails, setEmails] = useState<EmailRecord[]>([])
  const [calls, setCalls] = useState<CallRecord[]>([])
  const [messages, setMessages] = useState<ComplaintMessage[]>([])
  const [session, setSession] = useState<Session | null>(loadSession)
  const [ready, setReady] = useState(false)
  const lastPersistedSnapshot = useRef<string | null>(null)
  // Set by the polling effect below so other effects can force an immediate
  // re-read instead of waiting out the 30s interval.
  const pollNowRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    if (session) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } else {
      sessionStorage.removeItem(SESSION_KEY)
      localStorage.removeItem(SESSION_KEY)
    }
  }, [session])

  // Boot: hydrate the whole store from Supabase on mount so reloads and
  // other tabs pick up the persisted data. If Supabase is not configured,
  // the app starts empty and keeps only what the user creates locally.
  useEffect(() => {
    let cancelled = false
    async function boot() {
      if (import.meta.env.DEV) warnMissingEnv()
      if (!isSupabaseConfigured()) {
        setReady(true)
        return
      }
      // Restore the persisted session FIRST so every hydrate query runs as
      // the authenticated user. Otherwise RLS (auth.role()='authenticated')
      // returns 0 rows on reload and approved signups look "lost".
      const { data: authData } = await supabase!.auth.getSession()
      if (cancelled) return

      const data: HydratedData | null = await hydrateAll()
      if (cancelled || !data) {
        setReady(true)
        return
      }
      if (data.customers.length === 0 && data.accounts.length === 0 && data.amcs.length === 0 && !authData.session) {
        setCustomers([])
        setAmcs([])
        setServices([])
        setComplaints([])
        setPayments([])
        setRetention([])
        setNotifications([])
        setEmails([])
        setCalls([])
        setMessages([])
        setAccounts([])
        setAssets([])
        setSession(null)
        setReady(true)
        return
      }
      setCustomers(data.customers)
      setAssets(data.assets)
      setAmcs(data.amcs)
      setServices(data.services)
      setComplaints(data.complaints)
      setPayments(data.payments)
      setRetention(data.retention)
      setNotifications(data.notifications)
      setEmails(data.emails)
      setCalls(data.calls)
      setMessages(data.messages)
      setAccounts(data.accounts)
      // Same key set as the persist guard below, otherwise the two snapshots can
      // never be equal and every page load fires a pointless bulk write.
      lastPersistedSnapshot.current = JSON.stringify({
        customers: data.customers,
        payments: data.payments,
        retention: data.retention,
        emails: data.emails,
      })

      if (!cancelled) {
        const existingSession = loadSession()
        if (existingSession) {
          setSession(existingSession)
        } else if (authData.session) {
          const user = authData.session.user
          const account = data.accounts.find((a) => a.authUid === user.id)
          if (account) {
            setSession({
              name: account.name,
              email: account.email,
              role: account.role,
              customerId: account.customerId ?? (account.role === 'customer' ? account.id : undefined),
              technicianId: account.technicianId ?? (account.role === 'technician' ? account.name : undefined),
            })
          } else if (user.app_metadata?.role === 'admin') {
            setSession({ name: user.user_metadata?.name ?? 'Service Operations', email: user.email ?? '', role: 'admin' })
          }
        }
      }
      setReady(true)
    }
    boot()
    return () => {
      cancelled = true
    }
  }, [])

  // Persist the bulk-owned collections back to Supabase after each change.
  // Data is small, so a full upsert per mutation is fine and stays correct in
  // both tabs and single-window use. Skipped until hydration is done so we
  // never overwrite fresh rows from the DB with stale seed defaults.
  // A snapshot diff guards against write loops: realtime echoes and the
  // refresh-refetch produce identical state, so we only upstream real
  // local mutations. Services are NOT part of this — they persist one row at a
  // time through upsertServiceDb so a satisfaction rating can never be pushed
  // back to null by a tab that has not seen it yet.
  useEffect(() => {
    if (!ready || !isSupabaseConfigured()) return
    const snapshot = JSON.stringify({ customers, payments, retention, emails })
    if (snapshot === lastPersistedSnapshot.current) return
    lastPersistedSnapshot.current = snapshot
    void persistAllNow()
  }, [ready, customers, payments, retention, emails])

  const persistAllNow = () =>
    persistAll({ customers, payments, retention, accounts })

  // Live cross-device sync: when a payment flips to Paid (e.g. completed
  // from the phone's public /pay/:refId page), push that row into state on
  // every open tab. The portal success modal and the admin dashboard both
  // react without a manual refresh. Only watches UPDATEs to avoid
  // re-hydrating on our own local changes.
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const unsubscribe = subscribePayments((payment) => {
      setPayments((prev) => {
        const idx = prev.findIndex((p) => p.id === payment.id)
        if (idx === -1) return [payment, ...prev]
        const next = [...prev]
        next[idx] = payment
        return next
      })
    })
    return unsubscribe
  }, [])

  // Live cross-device sync for signups/approvals: a new profile row (customer
  // or technician signing up on another device) appears on the admin Accounts
  // page immediately, and approval/removal done in another tab propagates here.
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const unsubscribe = subscribeAccounts((event, account) => {
      setAccounts((prev) => {
        if (event === 'DELETE') return prev.filter((a) => a.id !== account.id)
        const idx = prev.findIndex((a) => a.id === account.id)
        if (idx === -1) return [account, ...prev]
        const next = [...prev]
        next[idx] = account
        return next
      })
    })
    return unsubscribe
  }, [])

  // Polling fallback so the admin never has to hit refresh: even without
  // Realtime enabled, re-hydrating periodically surfaces new signups
  // (pending approve requests), approvals made on another device, and
  // notification cleanup after deletes. Realtime already streams emails,
  // calls, complaints, accounts, notifications and payments live, so this
  // poll deliberately runs slowly — it is a safety net, not the source of
  // truth. The merges below are idempotent and keep whatever is already in
  // memory (read-state preserved), so it's harmless if the realtime
  // subscription above also delivers the same rows.
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let cancelled = false
    const poll = async () => {
      if (cancelled) return
      const data = await hydrateAll()
      if (cancelled || !data) return
      // Trending root cause of "blank" admin screens: several dropdowns and
      // detail pages source from `customers`/`complaints` (the payment-request
      // customer select, complaint assign-to-technician, complaint resolve
      // panel, AMC/renewal lookups). Those stayed empty because the older
      // poll only merged `accounts` + `notifications`. Merge every collection
      // here — same idempotent-by-id merge, harmless if realtime delivers the
      // identical rows.
      const mergeRows = <T extends { id: string }>(setter: React.Dispatch<React.SetStateAction<T[]>>, rows: T[]) => {
        setter((prev) => {
          const next = [...prev]
          for (const r of rows) {
            const i = next.findIndex((x) => x.id === r.id)
            if (i === -1) next.push(r)
            else next[i] = { ...next[i], ...r }
          }
          return next
        })
      }
      // Same merge, but it also drops rows the database no longer has. A plain
      // merge can only ever add, so anything deleted in another tab — or by an
      // admin elsewhere — stayed on screen for the rest of the session, and a
      // delete that raced an in-flight poll could re-add itself and never be
      // cleaned up again.
      const syncRows = <T extends { id: string }>(setter: React.Dispatch<React.SetStateAction<T[]>>, rows: T[]) => {
        setter((prev) => {
          const incoming = new Map(rows.map((r) => [r.id, r]))
          const next: T[] = []
          for (const existing of prev) {
            const fresh = incoming.get(existing.id)
            if (fresh) next.push({ ...existing, ...fresh })
          }
          const known = new Set(prev.map((x) => x.id))
          for (const r of rows) if (!known.has(r.id)) next.push(r)
          return next
        })
      }
      // Collections whose table could not be read this time come back empty, and
      // an empty list is indistinguishable from "no rows exist". Reconciling
      // those would delete real records off the screen, so they only get added
      // to — never pruned.
      const incomplete = new Set<string>(data.incomplete)
      const isComplete = (key: string) => !incomplete.has(key)
      const apply = <T extends { id: string }>(key: string, setter: React.Dispatch<React.SetStateAction<T[]>>, rows: T[]) =>
        isComplete(key) ? syncRows(setter, rows) : mergeRows(setter, rows)
      apply('assets', setAssets, data.assets)
      apply('amcs', setAmcs, data.amcs)
      apply('services', setServices, data.services)
      apply('payments', setPayments, data.payments)
      apply('retention', setRetention, data.retention)
      apply('emails', setEmails, data.emails)
      apply('calls', setCalls, data.calls)
      apply('messages', setMessages, data.messages)
      apply('accounts', setAccounts, data.accounts)
      apply('notifications', setNotifications, data.notifications)
      apply('customers', setCustomers, data.customers)
      apply('complaints', setComplaints, data.complaints)
    }
    const timer = setInterval(() => { void poll() }, 30000)
    pollNowRef.current = poll
    return () => {
      cancelled = true
      pollNowRef.current = null
      clearInterval(timer)
    }
  }, [])

  // Re-read everything the moment a session exists.
  //
  // The boot effect above runs once, on mount. On a normal visit that is *before*
  // sign-in, so it hydrates as an anonymous user and RLS returns nothing — and
  // then nothing re-reads the database until the 30s poll fires. Signing in
  // therefore left the whole portal blank for up to half a minute: no jobs, no
  // complaints, and no AI call. The visible symptom was a technician who had
  // been assigned a complaint reporting they never got the call, when in fact
  // it was sitting in the database the whole time, waiting for a poll.
  //
  // Realtime cannot cover this gap either: it only delivers rows that change
  // *after* the channel is open, so a call queued before sign-in is never pushed
  // to a client that subscribes afterwards. One read on sign-in closes both.
  const hydratedForSession = useRef<string | null>(null)
  const sessionKey = session ? `${session.role}:${session.email}` : null
  useEffect(() => {
    if (!sessionKey || !ready || !isSupabaseConfigured()) return
    if (hydratedForSession.current === sessionKey) return
    hydratedForSession.current = sessionKey
    void pollNowRef.current?.()
  }, [sessionKey, ready])


  // or a tech resolves a complaint, every other open tab picks it up instantly
  // so the portal, admin and tech dashboards stay in sync without a page reload.
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const unsubscribe = subscribeComplaints((event, complaint) => {
      setComplaints((prev) => {
        if (event === 'DELETE') return prev.filter((c) => c.id !== complaint.id)
        const idx = prev.findIndex((c) => c.id === complaint.id)
        if (idx === -1) return [complaint, ...prev]
        const next = [...prev]
        next[idx] = complaint
        return next
      })
    })
    return unsubscribe
  }, [])

  // Live visit updates for the dispatch board. When someone books a visit or a
  // tech starts one, the board moves without a reload. The existing poll keeps
  // running underneath, so a dropped websocket costs freshness, not function.
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const unsubscribe = subscribeServices((event, service) => {
      setServices((prev) => {
        if (event === 'DELETE') return prev.filter((s) => s.id !== service.id)
        const idx = prev.findIndex((s) => s.id === service.id)
        if (idx === -1) return [service, ...prev]
        const next = [...prev]
        next[idx] = service
        return next
      })
    })
    return unsubscribe
  }, [])

  // Live cross-device sync for notifications: signups, approvals, complaints,
  // payment requests and the DB-generated "Payment received" trigger all
  // insert notification rows. This makes the admin bell badge update live
  // across every open tab — no page reload needed.
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const unsubscribe = subscribeNotifications((event, notification) => {
      setNotifications((prev) => {
        if (event === 'DELETE') return prev.filter((n) => n.id !== notification.id)
        const idx = prev.findIndex((n) => n.id === notification.id)
        if (idx === -1) return [notification, ...prev]
        const next = [...prev]
        next[idx] = notification
        return next
      })
    })
    return unsubscribe
  }, [])

  // Live cross-device sync for the email outbox: the outbox worker (n8n) owns
  // the queued -> sent transition, and marking an email read in one tab should
  // reflect everywhere. Without this the browser would keep a stale 'queued'
  // status and the worker could re-send the same email every minute.
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const unsubscribe = subscribeEmails((event, email) => {
      setEmails((prev) => {
        if (event === 'DELETE') return prev.filter((e) => e.id !== email.id)
        const idx = prev.findIndex((e) => e.id === email.id)
        if (idx === -1) return [email, ...prev]
        const next = [...prev]
        next[idx] = email
        return next
      })
    })
    return unsubscribe
  }, [])

  // Live cross-device sync for AI calls: when an admin assigns a complaint,
  // the queued call row appears here instantly so the technician portal rings;
  // the answered/missed transition the tech makes propagates back everywhere.
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const unsubscribe = subscribeCalls((event, call) => {
      setCalls((prev) => {
        if (event === 'DELETE') return prev.filter((c) => c.id !== call.id)
        const idx = prev.findIndex((c) => c.id === call.id)
        if (idx === -1) return [call, ...prev]
        const next = [...prev]
        next[idx] = call
        return next
      })
    })
    return unsubscribe
  }, [])

  // Live complaint chat: a message sent from the admin, customer portal or
  // tech portal is inserted by its sender and the row lands here via realtime
  // so every other open tab updates the thread instantly.
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const unsubscribe = subscribeMessages((event, message) => {
      setMessages((prev) => {
        if (event === 'DELETE') return prev.filter((m) => m.id !== message.id)
        const idx = prev.findIndex((m) => m.id === message.id)
        if (idx === -1) return [message, ...prev]
        const next = [...prev]
        next[idx] = message
        return next
      })
    })
    return unsubscribe
  }, [])

  const value = useMemo<AppStore>(() => {
    const pushNotification = (type: NotificationType, title: string, description: string, customerId?: string, link?: string) => {
      const notification: Notification = { id: `N-${Date.now()}-${Math.round(Math.random() * 1e4)}`, type, title, description, time: new Date().toISOString(), read: false, customerId, link }
      setNotifications((prev) => [notification, ...prev])
      // Persist immediately so a realtime INSERT reaches every open tab and the
      // row survives reloads — notifications are excluded from the bulk persist
      // precisely so deleted notification rows stay deleted.
      if (isSupabaseConfigured()) void updateNotificationDb(notification)
    }

    const pushEmail = (toEmail: string, to: string, subject: string, body: string, type: EmailType) => {
      const email: EmailRecord = { id: `E-${Date.now()}-${Math.round(Math.random() * 1e4)}`, to, toEmail, subject, body, type, sentAt: new Date().toISOString(), read: false, status: 'queued' }
      setEmails((prev) => [email, ...prev])
      // Persist immediately (like pushCall) so a realtime INSERT reaches every
      // open tab instantly and the Email Inbox updates in lockstep with the
      // call log — not only when the bulk snapshot persist next fires.
      if (isSupabaseConfigured()) void updateEmailDb(email)
    }

    const pushCall = (toName: string, complaintId: string | undefined, message: string) => {
      // Never stack duplicate queued calls for the same technician + complaint:
      // a second assign of the same still-open complaint must not ring again.
      const alreadyQueued = calls.some((c) => c.toName === toName && c.complaintId === complaintId && c.status === 'queued')
      if (alreadyQueued) return
      const call: CallRecord = {
        id: `CL-${Date.now()}-${Math.round(Math.random() * 1e4)}`,
        toName,
        complaintId,
        type: 'assignment',
        message,
        status: 'queued',
        createdAt: new Date().toISOString(),
        read: false,
      }
      setCalls((prev) => [call, ...prev])
      if (isSupabaseConfigured()) void updateCallDb(call)
    }

    const markCallStatus = (id: string, status: CallStatus) => {
      const target = calls.find((c) => c.id === id)
      setCalls((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c
          const updated = { ...c, status }
          if (isSupabaseConfigured()) void updateCallDb(updated)
          return updated
        }),
      )
      if (target && (status === 'answered' || status === 'missed')) {
        const actedBy = session?.name ?? 'Technician'
        pushNotification(
          'Complaint',
          status === 'answered' ? 'AI call answered' : 'AI call missed',
          `${actedBy} ${status === 'answered' ? 'accepted' : 'missed'} the AI call · ${target.complaintId ?? id}`,
          undefined,
          '/settings',
        )
      }
    }

    const emailForTech = (name: string): string | undefined => {
      const direct = technicianEmail(name)
      if (direct) return direct
      const account = accounts.find((a) => a.technicianId === name || a.name === name)
      return account?.email
    }

    return {
      session,
      // True once the app has finished deciding whether a session exists.
      // Until then `session` is null for "not logged in" and for "not looked
      // up yet", and route guards cannot tell those apart.
      ready,
      login: async (email, password, expectedRole) => {
        if (!isSupabaseConfigured()) {
          const outcome = loginWithCredentials(email, password, accounts, expectedRole)
          if (outcome.ok) setSession(outcome.session)
          return outcome
        }
        const { data, error } = await supabase!.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
        if (error || !data.user) {
          // Surface the real reason instead of a blanket "Invalid email or
          // password." — Supabase throttles sign-in attempts per account/IP and
          // returns a rate-limit error that resolves on its own after a short
          // cooldown, which previously read as a confusing "email is incorrect".
          const raw = error?.message ?? ''
          const low = raw.toLowerCase()
          let message = 'Invalid email or password.'
          if (raw) {
            if (low.includes('rate limit') || low.includes('too many') || low.includes('capacity') || low.includes('multiple requests') || /rate.?limit/.test(low) || raw.includes('429')) {
              message = 'Too many sign-in attempts. Wait a minute, then try again.'
            } else if (low.includes('not confirmed') || low.includes('confirmation')) {
              message = 'This email is not confirmed yet — check your inbox for the confirmation link, or ask the admin to resend it.'
            } else if (low.includes('user not found') || low.includes('no user')) {
              message = 'No account found with this email. Create one below.'
            } else if (low.includes('signup') || low.includes('sign-up')) {
              message = 'Sign-ups are disabled right now. Contact the admin to create your account.'
            } else if (low.includes('invalid') || low.includes('wrong') || low.includes('password') || low.includes('credential')) {
              message = 'Invalid email or password.'
            } else {
              message = raw
            }
          }
          return { ok: false, code: 'invalid', message }
        }
        const { data: profile } = await supabase!.from('profiles').select('*').eq('auth_uid', data.user.id).maybeSingle()
        const account = profile ? profileToAccount(profile as Parameters<typeof profileToAccount>[0]) : undefined
        if (!account) {
          const admin = data.user.app_metadata?.role === 'admin'
          if (admin) {
            if (expectedRole && expectedRole !== 'admin') {
              await supabase!.auth.signOut()
              return { ok: false, code: 'invalid', message: 'This account is registered as an Admin. Please select the Admin login tab.' }
            }
            const s: Session = { name: data.user.user_metadata?.name ?? 'Service Operations', email: data.user.email ?? email, role: 'admin' }
            setSession(s)
            return { ok: true, role: 'admin', session: s }
          }
          await supabase!.auth.signOut()
          return { ok: false, code: 'unknown', message: 'No account found with this email. Create one below.' }
        }
        if (expectedRole && (account.role as string) !== expectedRole) {
          await supabase!.auth.signOut()
          const roleTitle = account.role === 'customer' ? 'Customer' : 'Technician'
          return { ok: false, code: 'invalid', message: `This account is registered as a ${roleTitle}. Please select the ${roleTitle} login tab.` }
        }
        if (account.status === 'pending') {
          await supabase!.auth.signOut()
          return { ok: false, code: 'pending', message: 'Your account is awaiting admin approval. You will receive an email once approved.' }
        }
        if (account.status === 'rejected') {
          await supabase!.auth.signOut()
          return { ok: false, code: 'rejected', message: 'Your signup was not approved.' + (account.note ? ` ${account.note}` : ' Please contact support.') }
        }
        const s: Session = {
          name: account.name,
          email: account.email,
          role: account.role,
          customerId: account.customerId ?? (account.role === 'customer' ? account.id : undefined),
          technicianId: account.technicianId ?? (account.role === 'technician' ? account.name : undefined),
        }
        setSession(s)
        return { ok: true, role: account.role, session: s }
      },
      quickLogin: (s) => setSession(s),
      logout: () => {
        setSession(null)
        if (isSupabaseConfigured()) void supabase!.auth.signOut()
      },
      customers,
      assets,
      amcs,
      services,
      complaints,
      payments,
      retention,
      notifications,
      accounts,
      emails,
      calls,
      addCustomer: (customer) => setCustomers((prev) => [customer, ...prev]),
      updateCustomer: async (id, updates) => {
        const target = customers.find((c) => c.id === id)
        if (!target) return false
        const updated = { ...target, ...updates }
        setCustomers((prev) => prev.map((c) => (c.id === id ? updated : c)))
        if (!isSupabaseConfigured()) return true
        // Only the edited fields are sent, so a customer saved in another tab
        // keeps whatever this one did not touch.
        const ok = await updateCustomerDb(id, updates)
        // Rolled back on failure, for the same reason assets are: a rejected
        // write that stays on screen reads as a successful save.
        if (!ok) setCustomers((prev) => prev.map((c) => (c.id === id ? target : c)))
        return ok
      },
      addAsset: async (asset) => {
        setAssets((prev) => [asset, ...prev])
        // Single-row write for the same reason as contracts: assets is excluded
        // from persistAll so a machine deleted in one tab cannot be re-inserted
        // by another tab that is still holding the old list.
        if (!isSupabaseConfigured()) return true
        const ok = await upsertAssetDb(asset)
        // A rejected write used to be swallowed here, so the machine appeared to
        // save and then silently vanished on the next reload. Take the row back
        // off the screen so what you see is what the database actually holds.
        if (!ok) setAssets((prev) => prev.filter((a) => a.id !== asset.id))
        return ok
      },
      updateAsset: async (id, updates) => {
        const target = assets.find((a) => a.id === id)
        if (!target) return false
        const updated = { ...target, ...updates }
        setAssets((prev) => prev.map((a) => (a.id === id ? updated : a)))
        if (!isSupabaseConfigured()) return true
        const ok = await upsertAssetDb(updated)
        if (!ok) setAssets((prev) => prev.map((a) => (a.id === id ? target : a)))
        return ok
      },
      deleteAsset: async (id) => {
        // Clear the pointers first so the app never shows a machine that the
        // database has already removed, and report failure honestly.
        const target = assets.find((a) => a.id === id)
        setAssets((prev) => prev.filter((a) => a.id !== id))
        setAmcs((prev) => prev.map((a) => (a.assetId === id ? { ...a, assetId: null } : a)))
        setServices((prev) => prev.map((s) => (s.assetId === id ? { ...s, assetId: null } : s)))
        setComplaints((prev) => prev.map((c) => (c.assetId === id ? { ...c, assetId: null } : c)))
        if (!isSupabaseConfigured()) return true
        const ok = await deleteAssetDb(id)
        // Put it back if the row was never really deleted, otherwise the register
        // claims a machine is gone while the database still has it.
        if (!ok && target) setAssets((prev) => [target, ...prev])
        return ok
      },
      addAmc: (amc) => {
        setAmcs((prev) => [amc, ...prev])
        // Persist the new contract immediately instead of through the bulk
        // snapshot — amcs is excluded from persistAll so a contract deleted in
        // one tab can never be re-inserted by another tab's stale copy.
        if (isSupabaseConfigured()) void upsertAmcDb(amc)
      },
      updateAmc: (id, updates) => {
        const target = amcs.find((a) => a.id === id)
        if (!target) return
        const updated = { ...target, ...updates }
        setAmcs((prev) => prev.map((a) => (a.id === id ? updated : a)))
        if (isSupabaseConfigured()) void upsertAmcDb(updated)
      },
      addService: (service) => {
        setServices((prev) => [service, ...prev])
        if (isSupabaseConfigured()) void upsertServiceDb(service)
      },
      updateService: (id, updates) => {
        const previous = services.find((s) => s.id === id)
        if (!previous) return
        const updated = { ...previous, ...updates }
        setServices((prev) => prev.map((s) => (s.id === id ? updated : s)))
        if (isSupabaseConfigured()) void upsertServiceDb(updated)
        // Finishing a visit is the moment the customer actually hears about it.
        // The technician UI used to claim this without sending anything, so the
        // notification and the "rate us" email are issued here, on the
        // transition into Completed only.
        if (updates.status === 'Completed' && previous.status !== 'Completed') {
          const customer = customers.find((c) => c.id === updated.customerId)
          const work = updated.notes.trim()
          pushNotification(
            'Service',
            `Your ${updated.serviceType} visit is complete`,
            work ? work.slice(0, 100) : `Serviced by ${updated.technician || 'our technician'}`,
            updated.customerId,
            '/portal/services',
          )
          if (customer) {
            pushEmail(
              customer.email,
              customer.name,
              `Your ${updated.serviceType} visit on ${formatDate(updated.date)} is complete`,
              `Hi ${customer.name},\n\nYour ${updated.serviceType} visit on ${formatDate(updated.date)} has been marked complete${updated.technician ? ` by ${updated.technician}` : ''}.\n${work ? `\nWork carried out:\n"${work}"\n` : ''}\nPlease log in to your portal to rate your service satisfaction.`,
              'resolution',
            )
          }
        }
      },
      addComplaint: (complaint) => {
        // The clock starts when the customer reports the problem, not when this
        // row happens to be written, and the targets come from the severity
        // matrix rather than anything typed in by hand.
        const created = new Date(complaint.created)
        const createdAt = Number.isNaN(created.getTime()) ? new Date() : created
        const deadlines = slaDeadlinesFor(complaint.severity, createdAt)
        const stamped: Complaint = {
          ...complaint,
          slaRespondBy: deadlines.respondBy,
          slaResolveBy: deadlines.resolveBy,
        }
        setComplaints((prev) => [stamped, ...prev])
        // Persist the new complaint immediately (not via the bulk snapshot) so
        // portal submissions survive reloads and appear live on every tab —
        // complaints are excluded from persistAll so deleted rows stay deleted.
        if (isSupabaseConfigured()) void updateComplaintDb(stamped)
        const customer = customers.find((c) => c.id === complaint.customerId)
        pushNotification(
          'Complaint',
          `New complaint ${complaint.id} from ${customer?.name ?? 'customer'}`,
          `${complaint.severity} severity · ${complaint.category} — ${complaint.description.slice(0, 80)}`,
          complaint.customerId,
          `/complaints/${complaint.id}`,
        )
        const techEmailAddr = emailForTech(complaint.assignedTo)
        if (techEmailAddr) {
          pushEmail(
            techEmailAddr,
            complaint.assignedTo,
            `New problem assigned to you — ${complaint.id}`,
            `${customer?.name ?? complaint.customerId} reported a ${complaint.severity.toLowerCase()} ${complaint.category.toLowerCase()} issue:\n"${complaint.description.slice(0, 200)}"\n\nPlease begin work today.`,
            'assignment',
          )
        }
      },
      updateComplaint: (id, updates) => {
        const previous = complaints.find((c) => c.id === id)
        if (!previous) return
        const updated = { ...previous, ...updates }
        // Changing the severity changes the promise made to the customer, so the
        // deadlines move with it. The clock still starts from the original report
        // time — re-stamping it on an edit would quietly buy extra time.
        if (updates.severity && updates.severity !== previous.severity) {
          const created = new Date(previous.created)
          const base = Number.isNaN(created.getTime()) ? new Date() : created
          const deadlines = slaDeadlinesFor(updates.severity, base)
          updated.slaRespondBy = deadlines.respondBy
          updated.slaResolveBy = deadlines.resolveBy
        }
        setComplaints((prev) => prev.map((c) => (c.id === id ? updated : c)))
        if (isSupabaseConfigured()) {
          void updateComplaintDb(updated)
        }
        if (updates.severity === 'Critical' && previous.severity !== 'Critical' && previous.status !== 'Resolved' && previous.status !== 'Closed') {
          const techEmailAddr = emailForTech(previous.assignedTo)
          if (techEmailAddr) {
            pushEmail(
              techEmailAddr,
              previous.assignedTo,
              `Escalated to Critical — ${previous.id}`,
              `Complaint ${previous.id} has been escalated to Critical severity. Respond immediately.`,
              'escalation',
            )
          }
        }
      },
      assignComplaint: (id, technician, technicianEmail) => {
        const complaint = complaints.find((c) => c.id === id)
        if (!complaint) return
        // Being put on the job is the response, so this is where the respond
        // clock stops.
        const stamp = new Date().toISOString()
        const assignedToId = resolveTechnicianId(technician, accounts)
        const assigned: Complaint = { ...complaint, assignedTo: technician, assignedToId, assignedAt: stamp, respondedAt: complaint.respondedAt ?? stamp }
        // Score the complaint as it stood *before* responded_at was stamped.
        // Asking isBreached() about `assigned` cannot detect a missed response,
        // because the field it checks is exactly the one just filled in — so a
        // complaint assigned an hour after its respond deadline would have latched
        // as met and shown a green tick. Latch off the prior state instead.
        const missedResponse = complaint.respondedAt == null && isBreached(complaint)
        const updated: Complaint = { ...assigned, slaBreached: complaint.slaBreached || missedResponse || isBreached(assigned) }

        // Put the work on the dispatch board, which is the board the technician
        // actually plans their day from. Without this, an assigned complaint is
        // invisible there: the board reads services, and nothing until now wrote
        // one. Re-assigning moves the existing visit instead of adding a second,
        // so handing a complaint to somebody else does not leave a stale visit
        // behind with the previous technician on it.
        const visitId = complaint.serviceId || `SRV${stamp.replace(/\D/g, '')}`
        const visit = visitForComplaint({
          complaint: { ...complaint, serviceId: visitId },
          technician,
          technicianId: assignedToId,
          // Local date: the board groups by this string, and a UTC slice puts
          // an evening assignment on the wrong day for anyone not on GMT.
          date: daysFromNow(0),
          id: visitId,
        })
        if (visit) {
          const existing = services.find((s) => s.id === visit.id)
          if (existing) {
            setServices((prev) => prev.map((s) => (s.id === visit.id ? { ...s, technician, technicianId: assignedToId ?? null } : s)))
            if (isSupabaseConfigured()) void upsertServiceDb({ ...existing, technician, technicianId: assignedToId ?? null })
          } else {
            // Same as addService(), inlined: the store's own actions are not
            // in scope inside another action.
            setServices((prev) => [visit, ...prev])
            if (isSupabaseConfigured()) void upsertServiceDb(visit)
          }
          updated.serviceId = visit.id
        }

        setComplaints((prev) => prev.map((c) => (c.id === id ? updated : c)))
        if (isSupabaseConfigured()) {
          void updateComplaintDb(updated)
        }
        const customer = customers.find((c) => c.id === complaint.customerId)
        pushNotification(
          'Complaint',
          `${complaint.id} assigned to ${technician}`,
          `${customer?.name ?? complaint.customerId} — ${complaint.description.slice(0, 80)}`,
          complaint.customerId,
          `/complaints/${complaint.id}`,
        )
        const email = technicianEmail ?? emailForTech(technician)
        if (email) {
          pushEmail(
            email,
            technician,
            `New problem assigned to you — ${complaint.id}`,
            `${customer?.name ?? complaint.customerId} reported a ${complaint.severity.toLowerCase()} ${complaint.category.toLowerCase()} issue:\n"${complaint.description.slice(0, 200)}"\n\nPlease begin work today.`,
            'assignment',
          )
        }
        pushCall(
          technician,
          complaint.id,
          `Hi ${technician}, this is ServicePulse calling. A new complaint ${complaint.id} has been assigned to you. ${
            customer?.name ?? 'Your customer'
          } reported a ${complaint.severity.toLowerCase()} ${complaint.category.toLowerCase()} issue. The customer says: "${complaint.description}". Please open the technician app to view the details and begin work today.`,
        )
      },
      ensureComplaintVisit: async (id) => {
        const complaint = complaints.find((c) => c.id === id)
        if (!complaint) return null
        if (complaint.serviceId) return complaint.serviceId

        // Photos, parts and sign-off hang off a service id, so a complaint with
        // no visit yet has nowhere to put them. Creating the visit here keeps
        // the technician on the complaint they are looking at instead of sending
        // them off to the schedule to find the row and come back.
        const technician = complaint.assignedTo || session?.name || ''
        const technicianId = complaint.assignedToId || session?.technicianId || null
        const visitId = `SRV${Date.now()}`
        const visit = visitForComplaint({
          complaint: { ...complaint, serviceId: visitId },
          technician,
          technicianId,
          // Local date, not the UTC slice of the timestamp: an assignment made
          // late in the evening IST would otherwise land on the board a day
          // early, or straddle midnight into the wrong date entirely.
          date: daysFromNow(0),
          id: visitId,
        })
        if (!visit) return null
        const updated: Complaint = { ...complaint, serviceId: visit.id }
        setServices((prev) => (prev.some((s) => s.id === visit.id) ? prev : [visit, ...prev]))
        setComplaints((prev) => prev.map((c) => (c.id === id ? updated : c)))
        if (isSupabaseConfigured()) {
          void upsertServiceDb(visit)
          void updateComplaintDb(updated)
        }
        return visit.id
      },
      resolveComplaint: (id, resolution) => {
        const complaint = complaints.find((c) => c.id === id)
        if (!complaint) return
        // Resolving a complaint is the moment the hands-on work ends, so both
        // timestamps are set here — a separate updateComplaint() call would
        // upsert from a stale snapshot and wipe workCompletedAt.
        const stamp = new Date().toISOString()
        // Breach is latched rather than recomputed from scratch: a complaint
        // fixed an hour after its deadline is still a breach, and clearing the
        // flag on resolution would quietly erase the only record of it.
        const breached = complaint.slaBreached || isBreached({ ...complaint, status: 'Open' })
        // Resolution is the first moment the fixing visit is knowable, so the
        // link is recorded here rather than at intake. It is left null when
        // there is no single visit that can be pointed at: the first-time-fix
        // figure then falls back to inferring an answer, which is weaker but
        // still honest. Inventing a link to make a chart look better is the one
        // outcome worth avoiding here.
        const fixVisit = complaint.serviceId
          ? null
          : services
              .filter(
                (sv) =>
                  sv.customerId === complaint.customerId &&
                  sv.serviceType === complaint.serviceType &&
                  (sv.assetId ?? null) === (complaint.assetId ?? null) &&
                  sv.status === 'Completed' &&
                  sv.date.slice(0, 10) > complaint.created.slice(0, 10),
              )
              .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0]
        const updated: Complaint = {
          ...complaint,
          status: 'Resolved',
          resolution,
          analysis: undefined,
          resolvedAt: stamp,
          workCompletedAt: stamp,
          slaBreached: breached,
          serviceId: complaint.serviceId ?? fixVisit?.id ?? null,
        }
        setComplaints((prev) => prev.map((c) => (c.id === id ? updated : c)))
        if (isSupabaseConfigured()) {
          void updateComplaintDb(updated)
        }
        pushNotification(
          'Complaint',
          `Your complaint ${complaint.id} was resolved`,
          `${resolution.slice(0, 100)}`,
          complaint.customerId,
          `/portal/complaints/${complaint.id}`,
        )
        const customer = customers.find((c) => c.id === complaint.customerId)
        if (customer) {
          pushEmail(
            customer.email,
            customer.name,
            `Your complaint ${complaint.id} has been resolved`,
            `Hi ${customer.name},\n\n${complaint.id} (${complaint.category}) was marked resolved by ${complaint.assignedTo}:\n"${resolution.trim()}"\n\nPlease log in to your portal to rate your service satisfaction.`,
            'resolution',
          )
        }
      },
      rateComplaint: (id, satisfaction, feedback) => {
        const complaint = complaints.find((c) => c.id === id)
        if (!complaint) return
        const updated: Complaint = { ...complaint, satisfaction, feedback: feedback ?? complaint.feedback }
        setComplaints((prev) => prev.map((c) => (c.id === id ? updated : c)))
        if (isSupabaseConfigured()) {
          void updateComplaintDb(updated)
        }
        const customer = customers.find((c) => c.id === complaint.customerId)
        pushNotification(
          'Complaint',
          `Satisfaction rating ${satisfaction}/5 received for ${complaint.id}`,
          `${customer?.name ?? complaint.customerId} rated service ${satisfaction}/5 stars${feedback ? `: "${feedback}"` : ''}`,
          complaint.customerId,
          `/complaints/${complaint.id}`,
        )
      },
      rateService: (id, rating) => {
        const service = services.find((s) => s.id === id)
        if (!service) return
        const updated: ServiceRecord = { ...service, rating }
        setServices((prev) => prev.map((s) => (s.id === id ? updated : s)))
        if (isSupabaseConfigured()) void upsertServiceDb(updated)
        const customer = customers.find((c) => c.id === service.customerId)
        pushNotification(
          'Service',
          `Satisfaction rating ${rating}/5 received for ${service.id}`,
          `${customer?.name ?? service.customerId} rated the ${service.serviceType} visit ${rating}/5 stars`,
          service.customerId,
          `/services`,
        )
      },
      addPayment: (payment) => {
        setPayments((prev) => [payment, ...prev])
      },
      recordPayment: (id, updates) => {
        setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)))
        // In Supabase mode the payment-success database trigger queues the
        // receipt, including QR payments that bypass this app. Keep the local
        // fallback so standalone demos still show the customer email.
        if (updates.status === 'Paid' && !isSupabaseConfigured()) {
          const payment = payments.find((p) => p.id === id)
          if (payment) {
            const customer = customers.find((c) => c.id === payment.customerId)
            if (customer) {
              const paidDate = updates.paidDate ?? today()
              pushEmail(
                customer.email,
                customer.name,
                `Payment confirmed · ${payment.invoice}`,
                `Dear ${customer.name},\n\nYour payment of ${formatINR(payment.amount)} for invoice ${payment.invoice} has been successfully received on ${formatDate(paidDate)}.\n\nThank you for your prompt payment. If you have any questions, please contact us.\n\nWarm regards,\nServicePulse`,
                'reminder',
              )
              pushNotification(
                'Payment',
                `Payment confirmed for ${payment.invoice}`,
                `${formatINR(payment.amount)} received on ${formatDate(paidDate)}.`,
                customer.id,
                '/portal/payments',
              )
            }
          }
        }
      },
      sendPaymentConfirmation: (paymentId) => {
        const payment = payments.find((p) => p.id === paymentId)
        if (!payment) return
        const customer = customers.find((c) => c.id === payment.customerId)
        if (!customer) return
        const paidDate = payment.paidDate ?? today()
        pushEmail(
          customer.email,
          customer.name,
          `Payment confirmed · ${payment.invoice}`,
          `Dear ${customer.name},\n\nYour payment of ${formatINR(payment.amount)} for invoice ${payment.invoice} has been successfully received on ${formatDate(paidDate)}.\n\nThank you for your prompt payment. If you have any questions, please contact us.\n\nWarm regards,\nServicePulse`,
          'reminder',
        )
        pushNotification(
          'Payment',
          `Payment confirmed for ${payment.invoice}`,
          `${formatINR(payment.amount)} received on ${formatDate(paidDate)}.`,
          customer.id,
          '/portal/payments',
        )
      },
      setPaymentReference: async (id, referenceId) => {
        setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, referenceId } : p)))
        if (!isSupabaseConfigured()) return true
        return setPaymentReferenceDb(id, referenceId)
      },
      sendPaymentRequest: ({ customerId, amount, dueDate, note }) => {
        if (!customerId || !amount || amount <= 0 || !dueDate) {
          return Promise.resolve({ ok: false, message: 'Please choose a customer, amount and due date.' })
        }
        const customer = customers.find((c) => c.id === customerId)
        if (!customer) return Promise.resolve({ ok: false, message: 'Customer not found.' })

        const invoice = `INV-${Math.floor(9000 + Math.random() * 999)}`
        const payment: Payment = {
          id: `PAY${Date.now()}`,
          invoice,
          customerId,
          amcId: '',
          amount,
          dueDate,
          paidDate: null,
          status: 'Pending',
          method: 'UPI',
          referenceId: makeReferenceId(),
        }
        setPayments((prev) => [payment, ...prev])

        pushNotification(
          'Payment',
          `Payment request ${invoice}`,
          `Payment of ${formatINR(amount)} is due on ${formatDate(dueDate)}. Please pay from My Payments.`,
          customerId,
          '/portal/payments',
        )
        pushEmail(
          customer.email,
          customer.name,
          `Pending Payment ₹${amount.toLocaleString('en-IN')} due · ${invoice}`,
          `Dear ${customer.name},\n\nThis is a reminder that you have a PENDING payment on your account.\n\n-------------------------------------------\n  Invoice     : ${invoice}\n  Pending Amt : ${formatINR(amount)}\n  Due Date    : ${formatDate(dueDate)}\n  Status      : PENDING\n-------------------------------------------\n${note ? `\nNote: ${note}\n` : ''}\nPlease log in to your customer portal and complete the payment before the due date to avoid any service interruptions.\n\nIf you have already paid, please ignore this email.\n\nThank you,\nServicePulse`,
          'reminder',
        )

        return Promise.resolve({ ok: true, payment })
      },
      revertPayment: (id) => {
        const target = payments.find((p) => p.id === id)
        if (!target) return
        const customer = customers.find((c) => c.id === target.customerId)
        setPayments((prev) => prev.filter((p) => p.id !== id))
        setNotifications((prev) =>
          prev.filter((n) => !(n.customerId === target.customerId && n.title.includes(target.invoice))),
        )
        setEmails((prev) =>
          prev.filter((e) => !(customer && e.toEmail === customer.email && e.subject.includes(target.invoice))),
        )
        if (isSupabaseConfigured()) void revertPaymentRows(id, target.invoice)
      },
      setRetentionStatus: (id, status) =>
        setRetention((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a))),
      setRetentionOffer: (id, offer) =>
        setRetention((prev) => prev.map((a) => (a.id === id ? { ...a, renewalOffer: offer } : a))),
      registerAccount: async ({ name, email, password, role, company, serviceTypes, city }) => {
        const normalized = email.trim().toLowerCase()
        if (!name.trim() || !email.trim() || password.length < 6) {
          return { ok: false, message: 'Please fill all fields and use a password of at least 6 characters.' }
        }
        if (role === 'customer' && (!serviceTypes || serviceTypes.length === 0)) {
          return { ok: false, message: 'Select at least one service type.' }
        }
        const duplicate = accounts.some((a) => a.email.toLowerCase() === normalized)
        if (duplicate) return { ok: false, message: 'An account with this email already exists.' }

        if (isSupabaseConfigured()) {
          const account = buildPendingAccount({ name, email: normalized, password, role, company, serviceTypes, city }, accounts)
          const { data, error } = await supabase!.auth.signUp({
            email: normalized,
            password,
            options: {
              data: {
                name: account.name,
                role: account.role,
                company: account.company ?? null,
                service_types: account.serviceTypes ?? [],
                city: account.city ?? null,
              },
            },
          })
          if (error || !data.user) {
            if (error?.message.toLowerCase().includes('already registered') || String(error?.message ?? '').toLowerCase().includes('registered')) {
              return { ok: false, message: 'An account with this email already exists.' }
            }
            return { ok: false, message: error?.message || 'Could not create your account. Please try again.' }
          }
          const persisted: AuthAccount = { ...account, id: data.user.id, authUid: data.user.id }
          setAccounts((prev) => [persisted, ...prev])
          pushNotification('System', `New signup request from ${persisted.name}`, `${persisted.role === 'customer' ? 'Customer' : 'Technician'} account awaiting approval · ${persisted.email}`, undefined, '/accounts')
          pushEmail(
            persisted.email,
            persisted.name,
            'We received your signup request',
            `Hi ${persisted.name},\n\nThanks for signing up as a ${persisted.role}. Your account is pending approval by the ServicePulse operations team. You will receive an email once approved.`,
            'system',
          )
          return { ok: true }
        }

        const account = buildPendingAccount({ name, email: normalized, password, role, company, serviceTypes, city }, accounts)
        setAccounts((prev) => register(prev, { name, email: normalized, password, role, company, serviceTypes, city }))
        pushNotification('System', `New signup request from ${account.name}`, `${account.role === 'customer' ? 'Customer' : 'Technician'} account awaiting approval · ${account.email}`, undefined, '/accounts')
        pushEmail(
          account.email,
          account.name,
          'We received your signup request',
          `Hi ${account.name},\n\nThanks for signing up as a ${account.role}. Your account is pending approval by the ServicePulse operations team. You will receive an email once approved.`,
          'system',
        )
        return { ok: true }
      },
      approveAccount: async (id) => {
        const target = accounts.find((a) => a.id === id)
        if (!target || target.status !== 'pending') return
        let customerId = target.customerId
        if (target.role === 'customer' && !customers.some((c) => c.id === target.customerId)) {
          const nextNum = 1 + customers.reduce((max, c) => {
            const num = Number(c.id.slice(2))
            return Number.isFinite(num) ? Math.max(max, num) : max
          }, 0)
          customerId = `C-${nextNum}`
          const createdCustomerId = customerId
          const serviceTypes = (target.serviceTypes && target.serviceTypes.length > 0 ? target.serviceTypes : ['AC Service']) as ServiceTypeKey[]
          // A brand-new account has nothing behind it yet, so it starts with the
          // two baseline factors. These same factors have to reach the database
          // row: an empty array there would reload as a customer with no
          // factors at all, and the n8n risk scan has nothing to reason about.
          const openingFactors: RiskFactor[] = [
            { label: 'On-time payment', points: 10 },
            { label: 'Completed service', points: 5 },
          ]
          const customer: Customer = {
            id: customerId,
            name: target.name,
            company: target.company ?? target.name,
            email: target.email,
            phone: '+91 98100 12345',
            address: `${target.company ?? target.name}, ${target.city ?? 'Mumbai'}`,
            city: target.city ?? 'Mumbai',
            type: target.company ? 'Business' : 'Individual',
            serviceTypes,
            joined: today().toISOString().slice(0, 10),
            health: computeHealth(openingFactors),
          }
          setCustomers((prev) => [customer, ...prev])
          if (isSupabaseConfigured()) {
            supabase!.from('customers').upsert({ id: customer.id, name: customer.name, company: customer.company, email: customer.email, phone: customer.phone, address: customer.address, city: customer.city, type: customer.type, service_types: customer.serviceTypes, joined: customer.joined.slice(0, 10), factors: openingFactors, health: customer.health.score }, { onConflict: 'id' }).select().maybeSingle().then(({ error }) => { if (error) console.error('[approve] customers upsert:', error.message) })
          }
          serviceTypes.forEach((serviceType, idx) => {
            const amcNum = 1 + amcs.reduce((max, a) => {
              const num = Number(a.id.slice(4))
              return Number.isFinite(num) ? Math.max(max, num) : max
            }, 0)
            const amc: AMCContract = {
              id: `AMC-${idx === 0 ? amcNum : amcNum + 100 * (idx + 1)}`,
              customerId: createdCustomerId,
              serviceType,
              startDate: daysFromNow(-90),
              endDate: daysFromNow(180),
              amount: STARTER_AMC_AMOUNT[serviceType],
              status: 'Active',
              renewalStatus: 'None',
            }
            setAmcs((prev) => [...prev, amc])
            if (isSupabaseConfigured()) {
              supabase!.from('amcs').upsert({ id: amc.id, customer_id: amc.customerId, service_type: amc.serviceType, start_date: amc.startDate.slice(0, 10), end_date: amc.endDate.slice(0, 10), amount: amc.amount, status: amc.status, renewal_status: amc.renewalStatus }, { onConflict: 'id' }).select().maybeSingle().then(({ error }) => { if (error) console.error('[approve] amc upsert:', error.message) })
            }
          })
        }
        const technicianId = target.role === 'technician' ? (target.technicianId ?? target.name) : undefined
        setAccounts((prev) => approve(prev, id, { customerId: customerId ?? target.customerId, technicianId }))
        const now = new Date().toISOString()
        if (isSupabaseConfigured()) {
          const { error } = await supabase!.from('profiles').update({
            status: 'active',
            customer_id: customerId ?? target.customerId ?? null,
            technician_id: technicianId ?? null,
            approved_at: now,
          }).eq('id', id).select().maybeSingle()

          if (error) {
            console.error('[approve] profiles update:', error.message)
          } else {
            const fresh = await hydrateAll()
            if (fresh) {
              setCustomers(fresh.customers)
              setAmcs(fresh.amcs)
              setServices(fresh.services)
              setComplaints(fresh.complaints)
              setPayments(fresh.payments)
              setRetention(fresh.retention)
              setNotifications(fresh.notifications)
              setEmails(fresh.emails)
              setCalls(fresh.calls)
              setAccounts(fresh.accounts)
            }
          }
        }
        pushNotification('System', `${target.name}'s account approved`, `${target.role === 'customer' ? (target.serviceTypes ?? []).length + ' service' + ((target.serviceTypes ?? []).length === 1 ? '' : 's') + ' — customer profile and AMC created' : 'Technician can now sign in with their email and password.'}`, undefined, '/accounts')
        pushEmail(
          target.email,
          target.name,
          'Your ServicePulse account is now active',
          `Hi ${target.name},\n\nYour ${target.role} account has been approved. You can now sign in at the login page with the email and password you provided.`,
          'system',
        )
      },
      rejectAccount: async (id, note) => {
        const target = accounts.find((a) => a.id === id)
        if (!target || target.status !== 'pending') return
        setAccounts((prev) => reject(prev, id, note))
        if (isSupabaseConfigured()) {
          const { error } = await supabase!.from('profiles').update({
            status: 'rejected',
            note: note ?? null,
            approved_at: new Date().toISOString(),
          }).eq('id', id).select().maybeSingle()

          if (error) {
            console.error('[reject] profiles update:', error.message)
          } else {
            const fresh = await hydrateAll()
            if (fresh) {
              setCustomers(fresh.customers)
              setAmcs(fresh.amcs)
              setServices(fresh.services)
              setComplaints(fresh.complaints)
              setPayments(fresh.payments)
              setRetention(fresh.retention)
              setNotifications(fresh.notifications)
              setEmails(fresh.emails)
              setCalls(fresh.calls)
              setAccounts(fresh.accounts)
            }
          }
        }
        pushEmail(
          target.email,
          target.name,
          'Update on your ServicePulse signup',
          `Hi ${target.name},\n\nWe were unable to approve your signup request.${note ? ` Reason: ${note}` : ' Please contact support for help.'}`,
          'system',
        )
      },
      updateAccount: (id, updates) => {
        const target = accounts.find((a) => a.id === id)
        if (!target) return { ok: false, message: 'Account not found.' }
        const normalized = updates.email?.trim().toLowerCase()
        if (normalized && normalized !== target.email.toLowerCase()) {
          const duplicate = accounts.some((a) => a.id !== id && a.email.toLowerCase() === normalized)
          if (duplicate) return { ok: false, message: 'Another account already uses this email.' }
        }
        if (updates.password && updates.password.length < 6) {
          return { ok: false, message: 'Password must be at least 6 characters.' }
        }
        setAccounts((prev) => updateAccount(prev, id, { email: normalized ?? target.email, password: updates.password }))
        if (target.role === 'customer' && target.customerId && normalized) {
          setCustomers((prev) => prev.map((c) => (c.id === target.customerId ? { ...c, email: normalized } : c)))
        }
        if (isSupabaseConfigured()) {
          const profileUpdates: Parameters<typeof updateProfileRows>[1] = {}
          if (normalized) profileUpdates.email = normalized
          if (Object.keys(profileUpdates).length > 0) void updateProfileRows(id, profileUpdates)
        }
        pushNotification('System', `${target.name}'s account updated`, normalized ? `Sign-in email changed to ${normalized}.` : 'Sign-in password was changed.', undefined, '/accounts')
        return { ok: true }
      },
      setTechnicianSkills: async (id, skills) => {
        const target = accounts.find((a) => a.id === id)
        if (!target) return { ok: false, message: 'Account not found.' }
        if (target.role !== 'technician') return { ok: false, message: 'Only technicians have service types.' }
        const unique = Array.from(new Set(skills))
        setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, serviceTypes: unique } : a)))
        if (isSupabaseConfigured()) {
          const { error } = await supabase!.from('profiles').update({ service_types: unique }).eq('id', id)
          if (error) {
            // Put the old value back rather than leaving the screen showing
            // skills the database rejected.
            setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, serviceTypes: target.serviceTypes ?? [] } : a)))
            return { ok: false, message: error.message }
          }
        }
        return { ok: true }
      },
      deleteAccount: async (id) => {
        const target = accounts.find((a) => a.id === id)
        if (!target) return
        setAccounts((prev) => removeAccount(prev, id))
        if (target.role === 'customer' && target.customerId) {
          const cid = target.customerId
          setCustomers((prev) => prev.filter((c) => c.id !== cid))
          setAmcs((prev) => prev.filter((a) => a.customerId !== cid))
          setServices((prev) => prev.filter((s) => s.customerId !== cid))
          setComplaints((prev) => prev.filter((c) => c.customerId !== cid))
          setPayments((prev) => prev.filter((p) => p.customerId !== cid))
          setRetention((prev) => prev.filter((r) => r.customerId !== cid))
          setNotifications((prev) => prev.filter((n) => n.customerId !== cid))
        }
        if (isSupabaseConfigured()) {
          await deleteAccountRows(id, target.customerId ?? undefined, target.email)
        }
        pushNotification('System', `${target.name}'s account removed`, `${target.role === 'customer' ? 'Customer profile and tied records were deleted.' : 'Technician can no longer sign in.'}`, undefined, '/accounts')
        pushEmail(
          target.email,
          target.name,
          'Your ServicePulse account has been removed',
          `Hi ${target.name},\n\nYour ServicePulse account has been removed by the operations team. If you believe this is a mistake, please contact support.`,
          'system',
        )
      },
      deleteCustomer: async (customerId) => {
        const target = customers.find((c) => c.id === customerId)
        if (!target) return
        setCustomers((prev) => prev.filter((c) => c.id !== customerId))
        setAmcs((prev) => prev.filter((a) => a.customerId !== customerId))
        setServices((prev) => prev.filter((s) => s.customerId !== customerId))
        setComplaints((prev) => prev.filter((c) => c.customerId !== customerId))
        setPayments((prev) => prev.filter((p) => p.customerId !== customerId))
        setRetention((prev) => prev.filter((r) => r.customerId !== customerId))
        setNotifications((prev) => prev.filter((n) => n.customerId !== customerId))
        setAccounts((prev) => prev.filter((a) => a.customerId !== customerId))
        if (isSupabaseConfigured()) {
          await deleteCustomerRows(customerId, target.email)
        }
        pushNotification('System', `${target.name} removed from customers`, 'Customer profile and all tied records were deleted.', undefined, '/customers')
        pushEmail(
          target.email,
          target.name,
          'Your ServicePulse customer account was removed',
          `Hi ${target.name},\n\nYour customer record on ServicePulse was removed by the operations team. If you believe this is a mistake, please contact support.`,
          'system',
        )
      },
      deleteAmc: async (id) => {
        const target = amcs.find((a) => a.id === id)
        if (!target) return false
        const detachedPayments = payments.filter((p) => p.amcId === id)
        const droppedNotifications = notifications.filter((n) => n.link?.includes(`/amc-contracts/${id}`))
        const droppedEmails = emails.filter((e) => e.subject.includes(id))
        setAmcs((prev) => prev.filter((a) => a.id !== id))
        // Payments keep their invoice and amount but lose the contract link, so
        // no page renders a link to a contract that no longer exists.
        setPayments((prev) => prev.map((p) => (p.amcId === id ? { ...p, amcId: '' } : p)))
        setNotifications((prev) => prev.filter((n) => !droppedNotifications.includes(n)))
        setEmails((prev) => prev.filter((e) => !droppedEmails.includes(e)))
        if (!isSupabaseConfigured()) return true
        const ok = await deleteAmcDb(id)
        if (!ok) {
          setAmcs((prev) => [target, ...prev])
          setPayments((prev) =>
            prev.map((p) => (detachedPayments.find((d) => d.id === p.id) ? { ...p, amcId: id } : p)),
          )
          setNotifications((prev) => [...prev, ...droppedNotifications])
          setEmails((prev) => [...prev, ...droppedEmails])
        }
        return ok
      },
      deleteComplaint: async (id) => {
        // Assigning a complaint creates a dispatch visit and stamps it on the
        // complaint, so the reverse has to happen here or the board keeps showing
        // a visit for a complaint that no longer exists. Only the visit this
        // complaint owns is touched, never another visit for the same customer.
        const ownedVisitId = complaints.find((c) => c.id === id)?.serviceId
        if (ownedVisitId) {
          setServices((prev) => prev.filter((s) => s.id !== ownedVisitId))
          if (isSupabaseConfigured()) {
            // Photos and the signature live in their own tables plus the
            // evidence bucket, with no foreign key to cascade them, so they have
            // to be removed explicitly or the objects are orphaned in storage
            // and the rows are left pointing at a visit that no longer exists.
            void deleteServiceEvidence(ownedVisitId)
            void deleteServiceDb(ownedVisitId)
          }
        }
        setComplaints((prev) => prev.filter((c) => c.id !== id))
        setNotifications((prev) => prev.filter((n) => !n.link?.includes(`/complaints/${id}`)))
        setCalls((prev) => prev.filter((call) => call.complaintId !== id))
        setEmails((prev) => prev.filter((m) => !m.subject?.includes(`${id}`)))
        setMessages((prev) => prev.filter((m) => m.complaintId !== id))
        if (!isSupabaseConfigured()) return true
        return deleteComplaintDb(id)
      },
      sendMessage: (complaintId, senderRole, body) => {
        if (!body.trim()) return
        const message: ComplaintMessage = {
          id: `M-${Date.now()}-${Math.round(Math.random() * 1e4)}`,
          complaintId,
          senderRole,
          senderName: session?.name ?? (senderRole === 'admin' ? 'Service Desk' : senderRole === 'customer' ? 'Customer' : 'Technician'),
          body: body.trim(),
          createdAt: new Date().toISOString(),
        }
        // Optimistic first so the sender sees their bubble instantly; the
        // realtime INSERT then confirms it everywhere (the DB is the source
        // of truth once the complaint_messages migration exists).
        setMessages((prev) => [...prev, message])
        if (isSupabaseConfigured()) void insertMessageDb(message)
      },
      markNotificationRead: (id) => {
        const target = notifications.find((n) => n.id === id)
        if (target && isSupabaseConfigured()) void updateNotificationDb({ ...target, read: true })
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
      },
      markAllNotificationsRead: () => {
        if (isSupabaseConfigured()) {
          for (const n of notifications) {
            if (!n.read) void updateNotificationDb({ ...n, read: true })
          }
        }
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      },
      deleteNotification: (id) => {
        setNotifications((prev) => prev.filter((n) => n.id !== id))
        if (isSupabaseConfigured()) void deleteNotificationDb(id)
      },
      clearNotifications: () => {
        setNotifications([])
        if (isSupabaseConfigured()) void clearNotificationsDb()
      },
      markEmailRead: (id) => {
        const target = emails.find((e) => e.id === id)
        if (target && isSupabaseConfigured()) void updateEmailDb({ ...target, read: true })
        setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, read: true } : e)))
      },
      deleteEmail: (id) => {
        setEmails((prev) => prev.filter((e) => e.id !== id))
        if (isSupabaseConfigured()) void deleteEmailDb(id)
      },
      pushCall,
      markCallStatus,
      deleteCall: (id) => {
        setCalls((prev) => prev.filter((c) => c.id !== id))
        if (isSupabaseConfigured()) void deleteCallDb(id)
      },
      messages,
    }
  }, [session, customers, assets, amcs, services, complaints, payments, retention, notifications, accounts, emails, calls, messages])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useAppStore(): AppStore {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useAppStore must be used within AppStoreProvider')
  return ctx
}

export function useCustomer(customerId: string | undefined): Customer | undefined {
  const { customers } = useAppStore()
  return customers.find((c) => c.id === customerId)
}

export function useCustomerAmcs(customerId: string | undefined): AMCContract[] {
  const { amcs } = useAppStore()
  return useMemo(() => amcs.filter((a) => a.customerId === customerId), [amcs, customerId])
}
