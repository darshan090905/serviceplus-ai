import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import type { AMCContract, Customer, RetentionAction } from '../../types'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { StatusBadge } from '../ui/StatusBadge'
import { AIEmailGenerator } from './AIEmailGenerator'

interface Props {
  customer: Customer
  action: RetentionAction
  amc?: AMCContract
}

export function RetentionRecommendation({ customer, action, amc }: Props) {
  const navigate = useNavigate()
  return (
    <Card
      title="Recommended Retention Action"
      description="Based on business rules, customer data and AI assistance."
      actions={<StatusBadge kind="retention" value={action.status} />}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Primary risk</span>
        <StatusBadge kind="risk" value={customer.health.level} />
        <span className="text-sm font-semibold text-slate-800">{action.primaryRisk}</span>
      </div>
      <p className="mt-3 text-lg font-semibold text-slate-900">{action.recommendedAction}</p>
      <ul className="mt-2 space-y-1.5">
        {action.steps.map((step) => (
          <li key={step} className="flex items-start gap-2 text-sm text-slate-600">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
            {step}
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{action.reason}</p>
      {amc && (
        <p className="mt-2 text-xs text-slate-400">
          Revenue at risk: <span className="font-medium text-slate-600">₹{amc.amount.toLocaleString('en-IN')}</span> · renewal exposure only
        </p>
      )}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button
          variant="outline"
          icon={<ArrowRight className="h-4 w-4" />}
          onClick={() => navigate(`/retention/${action.id}`)}
        >
          Review Action
        </Button>
        <AIEmailGenerator action={action} customer={customer} />
      </div>
    </Card>
  )
}