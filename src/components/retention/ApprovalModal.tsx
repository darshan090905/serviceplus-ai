import type { Customer, RetentionAction } from '../../types'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { useToast } from '../ui/Toast'

interface Props {
  action: RetentionAction | null
  customer: Customer | undefined
  open: boolean
  onClose: () => void
  onApprove: (action: RetentionAction) => void
}

export function ApprovalModal({ action, customer, open, onClose, onApprove }: Props) {
  const { toast } = useToast()
  if (!action) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Approve retention action?"
      description="Confirm the recommended action before it is assigned to the team."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              onApprove(action)
              onClose()
              toast('Retention action approved.')
            }}
          >
            Approve Action
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Action</p>
          <p className="mt-1 text-sm font-medium text-slate-900">{action.recommendedAction}</p>
          <ul className="mt-2 space-y-1">
            {action.steps.map((step) => (
              <li key={step} className="flex items-center gap-2 text-sm text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden />
                {step}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
          <div>
            <p className="text-xs text-slate-400">Customer</p>
            <p className="text-sm font-medium text-slate-800">{customer?.name}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Priority</p>
            <Badge tone={action.priority === 1 ? 'critical' : action.priority === 2 ? 'danger' : 'warning'}>#{action.priority}</Badge>
          </div>
        </div>
        {action.requiresApproval && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This action includes a controlled offer and requires owner approval.
          </p>
        )}
      </div>
    </Modal>
  )
}