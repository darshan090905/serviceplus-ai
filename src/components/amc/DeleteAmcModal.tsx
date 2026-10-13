import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { AMCContract } from '../../types'
import { useAppStore } from '../../store/AppStore'
import { useToast } from '../ui/Toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { formatDate } from '../../utils/dates'
import { formatINR } from '../../utils/format'

interface Props {
  amc: AMCContract | null
  onClose: () => void
  onDeleted?: (id: string) => void
}

export function DeleteAmcModal({ amc, onClose, onDeleted }: Props) {
  const { customers, payments, deleteAmc } = useAppStore()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  if (!amc) return null

  const customer = customers.find((c) => c.id === amc.customerId)
  const linkedPayments = payments.filter((p) => p.amcId === amc.id)

  const confirm = async () => {
    setBusy(true)
    const ok = await deleteAmc(amc.id)
    setBusy(false)
    if (!ok) {
      toast(`Could not delete ${amc.id} — the contract has been restored.`, 'error')
      return
    }
    toast(`AMC contract ${amc.id} deleted.`, 'success')
    onDeleted?.(amc.id)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Delete contract ${amc.id}?`}
      description="This permanently removes the contract from the admin list, the customer portal and the database. This cannot be undone."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} loading={busy} onClick={confirm}>
            Delete permanently
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="font-medium text-slate-800">
            {customer?.name ?? amc.customerId}
            {customer?.company ? ` — ${customer.company}` : ''}
          </p>
          <p className="text-xs text-slate-500">
            {amc.serviceType} · {formatDate(amc.startDate)} → {formatDate(amc.endDate)} · {formatINR(amc.amount)}
          </p>
        </div>
        <p className="text-slate-500">
          The contract disappears immediately everywhere it is shown, and the row is removed from Supabase.
        </p>
        {linkedPayments.length > 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            {linkedPayments.length} payment{linkedPayments.length === 1 ? '' : 's'} (
            {linkedPayments.map((p) => p.invoice).join(', ')}) will be kept but detached from this contract, so
            no page shows a link to a contract that no longer exists.
          </p>
        ) : (
          <p className="text-slate-400">No payments are recorded against this contract.</p>
        )}
      </div>
    </Modal>
  )
}
