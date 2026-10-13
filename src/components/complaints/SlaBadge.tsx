import type { Complaint } from '../../types'
import { slaStateOf, slaLabel, SLA_TARGETS } from '../../utils/sla'
import { Badge } from '../ui/Badge'

interface Props {
  complaint: Complaint
  /**
   * `full` spells out the deadline, for the detail page. `dot` is a compact pill
   * for table rows, where there is no room for a sentence.
   */
  variant?: 'dot' | 'full'
}

const TONE = {
  none: 'neutral',
  met: 'success',
  atRisk: 'warning',
  breached: 'danger',
} as const

const LABEL = {
  none: 'No SLA',
  met: 'On track',
  atRisk: 'At risk',
  breached: 'Breached',
} as const

/**
 * Where a complaint stands against the promise made at the time it was raised.
 *
 * Deliberately says "No SLA" for complaints with no deadline rather than
 * showing a reassuring green tick: a pre-SLA complaint was never scored, and
 * claiming it is on time would be a claim nobody can support.
 */
export function SlaBadge({ complaint, variant = 'dot' }: Props) {
  const state = slaStateOf(complaint)
  if (state === 'none' && variant === 'dot') {
    return <span className="text-xs text-slate-400">—</span>
  }
  const target = SLA_TARGETS[complaint.severity]
  if (variant === 'dot') {
    return <Badge tone={TONE[state]}>{LABEL[state]}</Badge>
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Badge tone={TONE[state]}>{LABEL[state]}</Badge>
        <span className="text-xs text-slate-500">
          {complaint.severity} · respond in {target.respondHours}h, resolve in {target.resolveHours}h
        </span>
      </div>
      <p className="text-xs text-slate-500">{slaLabel(complaint)}</p>
    </div>
  )
}
