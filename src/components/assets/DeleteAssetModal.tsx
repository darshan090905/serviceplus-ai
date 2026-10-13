import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { EquipmentAsset } from '../../types'
import { useAppStore } from '../../store/AppStore'
import { useToast } from '../ui/Toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

interface Props {
  asset: EquipmentAsset | null
  onClose: () => void
  onConfirm: (asset: EquipmentAsset) => void | Promise<void>
}

/**
 * Removing a machine is destructive but not history-destroying: the contracts,
 * visits and complaints that referenced it are kept and simply stop pointing at
 * it, so past work stays auditable. That is why this is offered separately from
 * the "Retired" status, which is the softer option.
 */
export function DeleteAssetModal({ asset, onClose, onConfirm }: Props) {
  const { customers, amcs, services, complaints } = useAppStore()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  if (!asset) return null

  const customer = customers.find((c) => c.id === asset.customerId)
  const linked = {
    amcs: amcs.filter((a) => a.assetId === asset.id),
    services: services.filter((s) => s.assetId === asset.id),
    complaints: complaints.filter((c) => c.assetId === asset.id),
  }
  const total = linked.amcs.length + linked.services.length + linked.complaints.length
  const history = [
    linked.services.length ? `${linked.services.length} visit${linked.services.length === 1 ? '' : 's'}` : null,
    linked.complaints.length ? `${linked.complaints.length} complaint${linked.complaints.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' and ')

  const confirm = async () => {
    setBusy(true)
    try {
      await onConfirm(asset)
    } catch {
      toast(`Could not remove ${asset.name} — the database rejected the delete.`, 'error')
    } finally {
      setBusy(false)
      onClose()
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Remove ${asset.name}?`}
      description="This deletes the machine from the register and the database. This cannot be undone."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} loading={busy} onClick={confirm}>
            Remove machine
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="font-medium text-slate-800">{customer?.name ?? asset.customerId}</p>
          <p className="text-xs text-slate-500">
            {[asset.category, asset.capacity, asset.model, asset.serialNo].filter(Boolean).join(' · ')}
          </p>
        </div>
        {total === 0 ? (
          <p className="text-slate-500">Nothing is linked to this machine, so it leaves no history behind.</p>
        ) : (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            {linked.amcs.length} contract{linked.amcs.length === 1 ? '' : 's'} and {history || 'no visits'} are kept but
            detached from this machine, so the history stays readable without a link to a machine that no longer exists.
          </p>
        )}
        <p className="text-slate-400">
          To keep the machine and its history but stop it appearing as active, mark it Retired instead.
        </p>
      </div>
    </Modal>
  )
}
