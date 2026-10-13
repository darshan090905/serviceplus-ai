import type {
  ActivityEvent,
  AMCContract,
  Complaint,
  Customer,
  DashboardKpis,
  HealthDistribution,
  KpiTrend,
  Payment,
  RetentionAction,
} from '../types'
import { daysUntil, inRange, quarterWindow, today } from '../utils/dates'
import { slaStateOf, isComplaintOpen } from '../utils/sla'
import type { Prefs } from '../store/prefs'

type Period = { start: string; end: string }

// Percentage change between two counts. With no baseline there is nothing to
// divide by, so it reports the raw count rather than inventing "+100%".
function countTrend(current: number, previous: number, noun: string): KpiTrend {
  if (previous === 0) {
    return current === 0
      ? { label: `No ${noun} in either quarter`, direction: 'none' }
      : { label: `${current} new, none last quarter`, direction: 'up' }
  }
  if (current === previous) return { label: `Same as last quarter`, direction: 'flat' }
  const change = ((current - previous) / previous) * 100
  return {
    label: `${change > 0 ? '+' : ''}${change.toFixed(1)}% vs last quarter`,
    direction: change > 0 ? 'up' : 'down',
  }
}

// Rates move in percentage points, not percent — "+5%" on a 40% rate reads as
// a 2 point gain, which is a different and much smaller claim.
function rateTrend(current: number | null, previous: number | null): KpiTrend {
  if (current === null || previous === null) {
    return { label: 'Not enough invoices to compare', direction: 'none' }
  }
  const delta = current - previous
  if (delta === 0) return { label: 'Same as last quarter', direction: 'flat' }
  return {
    label: `${delta > 0 ? '+' : ''}${delta} pts vs last quarter`,
    direction: delta > 0 ? 'up' : 'down',
  }
}

function countInPeriod(period: Period, dates: string[]): number {
  return dates.filter((date) => inRange(date, period.start, period.end)).length
}

export function buildKpis(
  customers: Customer[],
  amcs: AMCContract[],
  payments: Payment[],
): DashboardKpis {
  const thisQuarter = quarterWindow(0)
  const lastQuarter = quarterWindow(1)

  const activeAmcs = amcs.filter((a) => a.status !== 'Expired' && a.status !== 'Renewed')
  const expiringSoon = amcs.filter((a) => a.status === 'Expiring Soon').length
  const highRisk = customers.filter((c) => c.health.level === 'At Risk' || c.health.level === 'Critical').length
  const outstanding = payments.filter((p) => p.status === 'Overdue' || p.status === 'Pending')
  const outstandingTotal = outstanding.reduce((sum, p) => sum + p.amount, 0)
  const overdueAccounts = new Set(payments.filter((p) => p.status === 'Overdue').map((p) => p.customerId)).size
  const paidCount = payments.filter((p) => p.status === 'Paid').length
  const renewalRate = payments.length ? Math.round((paidCount / payments.length) * 100) : 0

  // Collection rate for invoices that fell due in each quarter.
  const rateFor = (period: Period): number | null => {
    const due = payments.filter((p) => inRange(p.dueDate, period.start, period.end))
    if (!due.length) return null
    return Math.round((due.filter((p) => p.status === 'Paid').length / due.length) * 100)
  }

  // Contract value sitting behind customers flagged At Risk or Critical.
  const atRiskIds = new Set(
    customers.filter((c) => c.health.level === 'At Risk' || c.health.level === 'Critical').map((c) => c.id),
  )
  const atRiskRevenue = amcs
    .filter((a) => atRiskIds.has(a.customerId) && a.status !== 'Expired' && a.status !== 'Renewed')
    .reduce((sum, a) => sum + a.amount, 0)

  return {
    totalCustomers: customers.length,
    customerGrowth: countTrend(
      countInPeriod(thisQuarter, customers.map((c) => c.joined)),
      countInPeriod(lastQuarter, customers.map((c) => c.joined)),
      'customers signed',
    ),
    activeAmcs: activeAmcs.length,
    amcGrowth: countTrend(
      countInPeriod(thisQuarter, amcs.map((a) => a.startDate)),
      countInPeriod(lastQuarter, amcs.map((a) => a.startDate)),
      'contracts started',
    ),
    expiringSoon,
    highRisk,
    outstandingPayments: outstandingTotal,
    overdueAccounts,
    renewalRate,
    renewalRateDelta: rateTrend(rateFor(thisQuarter), rateFor(lastQuarter)),
    atRiskRevenue,
  }
}

export function buildHealthDistribution(customers: Customer[]): HealthDistribution {
  return customers.reduce<HealthDistribution>(
    (acc, c) => {
      acc[c.health.level] += 1
      return acc
    },
    { Healthy: 0, Watch: 0, 'At Risk': 0, Critical: 0 },
  )
}

export function buildRenewalPipeline(
  customers: Customer[],
  amcs: AMCContract[],
): Array<{ level: string; value: number; count: number }> {
  const levels: Array<Customer['health']['level']> = ['Healthy', 'Watch', 'At Risk', 'Critical']
  return levels.map((level) => {
    const ids = new Set(customers.filter((c) => c.health.level === level).map((c) => c.id))
    const value = amcs
      .filter((a) => ids.has(a.customerId) && a.status !== 'Renewed')
      .reduce((sum, a) => sum + a.amount, 0)
    return { level, value, count: ids.size }
  })
}

export function expiringAmcs(amcs: AMCContract[], withinDays = 30): AMCContract[] {
  return amcs
    .filter((a) => {
      const days = daysUntil(a.endDate)
      return days >= 0 && days <= withinDays
    })
    .sort((a, b) => daysUntil(a.endDate) - daysUntil(b.endDate))
}

export function buildPriorityActions(
  customers: Customer[],
  complaints: Complaint[],
  amcs: AMCContract[],
  payments: Payment[],
  prefs: Prefs,
): Array<{ title: string; count: number; detail: string; to: string }> {
  const actions: Array<{ title: string; count: number; detail: string; to: string }> = []

  if (prefs.highRisk) {
    actions.push({
      title: 'High-risk customers need attention',
      count: customers.filter((c) => c.health.level === 'At Risk' || c.health.level === 'Critical').length,
      detail: 'Review risk factors and assign retention actions',
      to: '/retention',
    })
  }

  if (prefs.complaintEscalation) {
    // Escalation is now per complaint rather than one global age threshold: a
    // Critical job that is 90 minutes late is a fire, a Low job that is 90
    // minutes late is not, and a single hours setting could not tell them apart.
    const open = complaints.filter(isComplaintOpen)
    const breached = open.filter((c) => slaStateOf(c) === 'breached')
    const atRisk = open.filter((c) => slaStateOf(c) === 'atRisk')
    // Complaints raised before SLA tracking existed carry no deadline. They are
    // still unresolved work, so they are surfaced rather than silently dropped
    // from the count.
    const untracked = open.filter((c) => slaStateOf(c) === 'none')
    actions.push({
      title: 'Complaints past their SLA deadline',
      count: breached.length,
      detail:
        untracked.length > 0
          ? `Escalate now · ${untracked.length} older complaint${untracked.length === 1 ? '' : 's'} have no SLA deadline on record`
          : 'Escalate and prioritize resolution',
      to: '/complaints',
    })
    actions.push({
      title: 'Complaints at risk of breaching',
      count: atRisk.length,
      detail: 'Less than 25% of the promised time left',
      to: '/complaints',
    })
  }

  if (prefs.amcExpiry) {
    actions.push({
      title: 'AMCs expire within 14 days',
      count: expiringAmcs(amcs, 14).length,
      detail: 'Reach out before contracts lapse',
      to: '/amc-contracts',
    })
  }

  if (prefs.paymentOverdue) {
    actions.push({
      title: 'Payments overdue',
      count: payments.filter((p) => p.status === 'Overdue').length,
      detail: 'Follow up on outstanding invoices',
      to: '/payments',
    })
  }

  return actions
}

export function buildRecentActivity(
  customers: Customer[],
  amcs: AMCContract[],
  services: { date: string; customerId: string; status: string }[],
  complaints: Complaint[],
  payments: Payment[],
  retention: RetentionAction[],
): ActivityEvent[] {
  const name = (id: string) => customers.find((c) => c.id === id)?.name ?? 'Customer'
  const events: ActivityEvent[] = []

  complaints.forEach((c) => {
    events.push({
      id: `ac-${c.id}`,
      type: 'complaint',
      title: c.status === 'Resolved' || c.status === 'Closed' ? 'Complaint resolved' : 'Complaint opened',
      detail: `${name(c.customerId)} — ${c.id}`,
      date: c.created,
      customerId: c.customerId,
    })
  })
  payments.forEach((p) => {
    if (p.status === 'Paid' && p.paidDate) {
      events.push({
        id: `ap-${p.id}`,
        type: 'payment',
        title: 'Payment received',
        detail: `${name(p.customerId)} — ${p.invoice}`,
        date: p.paidDate,
        customerId: p.customerId,
      })
    }
  })
  retention.forEach((r) => {
    events.push({
      id: `ar-${r.id}`,
      type: 'risk',
      title: 'Retention action assigned',
      detail: `${name(r.customerId)} — ${r.recommendedAction}`,
      date: today().toISOString().slice(0, 10),
      customerId: r.customerId,
    })
  })
  amcs.forEach((a) => {
    if (a.status === 'Expired') {
      events.push({
        id: `ae-${a.id}`,
        type: 'amc',
        title: 'AMC expired',
        detail: `${name(a.customerId)} — ${a.id}`,
        date: a.endDate,
        customerId: a.customerId,
      })
    }
  })
  services.forEach((s) => {
    if (s.status === 'Completed') {
      events.push({
        id: `as-${Math.random()}`,
        type: 'service',
        title: 'Service completed',
        detail: `${name(s.customerId)}`,
        date: s.date,
        customerId: s.customerId,
      })
    }
  })

  return events.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12)
}