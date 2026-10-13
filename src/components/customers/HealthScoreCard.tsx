import { AlertTriangle } from 'lucide-react'
import type { CustomerHealth } from '../../types'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { StatusBadge } from '../ui/StatusBadge'
import { HealthRing } from './HealthRing'

export function HealthScoreCard({ health }: { health: CustomerHealth }) {
  return (
    <Card title="Customer Health" description="Composite score from service, complaint & payment signals">
      <div className="flex items-center gap-4">
        <HealthRing score={health.score} level={health.level} size={72} />
        <div>
          <StatusBadge kind="risk" value={health.level} />
          <p className="mt-1 text-xs text-slate-500">{health.score} / 100</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Why?</p>
        {health.factors.length === 0 ? (
          <p className="text-sm text-slate-500">No negative signals detected yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {health.factors.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  {f.points < 0 && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden />}
                  {f.label}
                </span>
                <Badge tone={f.points >= 0 ? 'success' : 'danger'}>
                  {f.points >= 0 ? '+' : ''}
                  {f.points}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}