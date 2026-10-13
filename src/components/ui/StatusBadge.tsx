import { Badge, type BadgeTone } from './Badge'
import type {
  AmcStatus,
  ComplaintStatus,
  PaymentStatus,
  RetentionStatus,
  RiskLevel,
  ServiceStatus,
} from '../../types'

type StatusValue =
  | RiskLevel
  | AmcStatus
  | ComplaintStatus
  | PaymentStatus
  | ServiceStatus
  | RetentionStatus

const riskMap: Record<RiskLevel, { tone: BadgeTone; label: string }> = {
  Healthy: { tone: 'success', label: 'Healthy' },
  Watch: { tone: 'warning', label: 'Watch' },
  'At Risk': { tone: 'danger', label: 'At Risk' },
  Critical: { tone: 'critical', label: 'Critical' },
}

const amcMap: Record<AmcStatus, { tone: BadgeTone; label: string }> = {
  Active: { tone: 'success', label: 'Active' },
  'Expiring Soon': { tone: 'warning', label: 'Expiring Soon' },
  'Renewal Pending': { tone: 'info', label: 'Renewal Pending' },
  Renewed: { tone: 'neutral', label: 'Renewed' },
  Expired: { tone: 'neutral', label: 'Expired' },
}

const complaintMap: Record<ComplaintStatus, { tone: BadgeTone; label: string }> = {
  Open: { tone: 'danger', label: 'Open' },
  'In Progress': { tone: 'warning', label: 'In Progress' },
  Resolved: { tone: 'success', label: 'Resolved' },
  Closed: { tone: 'neutral', label: 'Closed' },
}

const paymentMap: Record<PaymentStatus, { tone: BadgeTone; label: string }> = {
  Paid: { tone: 'success', label: 'Paid' },
  Pending: { tone: 'warning', label: 'Pending' },
  Overdue: { tone: 'critical', label: 'Overdue' },
  'Partially Paid': { tone: 'info', label: 'Partially Paid' },
}

const serviceMap: Record<ServiceStatus, { tone: BadgeTone; label: string }> = {
  Scheduled: { tone: 'info', label: 'Scheduled' },
  'In Progress': { tone: 'warning', label: 'In Progress' },
  Completed: { tone: 'success', label: 'Completed' },
  Cancelled: { tone: 'neutral', label: 'Cancelled' },
}

const retentionMap: Record<RetentionStatus, { tone: BadgeTone; label: string }> = {
  Pending: { tone: 'warning', label: 'Pending' },
  Approved: { tone: 'info', label: 'Approved' },
  'In Progress': { tone: 'info', label: 'In Progress' },
  Completed: { tone: 'success', label: 'Completed' },
  Rejected: { tone: 'neutral', label: 'Rejected' },
}

type StatusMap = Record<string, { tone: BadgeTone; label: string }>

const registry: Record<string, StatusMap> = {
  risk: riskMap,
  amc: amcMap,
  complaint: complaintMap,
  payment: paymentMap,
  service: serviceMap,
  retention: retentionMap,
}

export type StatusKind = keyof typeof registry

export function StatusBadge({ kind, value }: { kind: StatusKind; value: StatusValue }) {
  const map = registry[kind]
  const entry = map[value] ?? { tone: 'neutral' as BadgeTone, label: String(value) }
  return <Badge tone={entry.tone}>{entry.label}</Badge>
}