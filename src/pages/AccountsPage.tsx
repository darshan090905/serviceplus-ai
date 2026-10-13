import { useMemo, useState } from 'react'
import { CheckCircle2, Clock, Pencil, ShieldCheck, Trash2, UserCheck, XCircle } from 'lucide-react'
import { useAppStore } from '../store/AppStore'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { StatCard } from '../components/ui/StatCard'
import { DataTable, type Column } from '../components/ui/DataTable'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Textarea, Input } from '../components/ui/Field'
import { Tabs } from '../components/ui/Tabs'
import { useToast } from '../components/ui/Toast'
import { formatDate, timeAgo } from '../utils/dates'
import { SERVICE_TYPES } from '../constants'
import type { ServiceTypeKey } from '../types'
import type { AccountStatus, AuthAccount } from '../types'

type Filter = 'pending' | 'active' | 'rejected' | 'all'
type RoleFilter = 'all' | 'customer' | 'technician'

const statusTone: Record<AccountStatus, 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  active: 'success',
  rejected: 'danger',
}

export function AccountsPage() {
  const { accounts, approveAccount, rejectAccount, updateAccount, setTechnicianSkills, deleteAccount } = useAppStore()
  const { toast } = useToast()
  const [filter, setFilter] = useState<Filter>('pending')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')

  const handleApprove = (account: AuthAccount) => {
    setFilter('active')
    setApproved(account)
    approveAccount(account.id)
  }
  const [rejecting, setRejecting] = useState<AuthAccount | null>(null)
  const [skillsFor, setSkillsFor] = useState<AuthAccount | null>(null)
  const [skillDraft, setSkillDraft] = useState<ServiceTypeKey[]>([])
  const [savingSkills, setSavingSkills] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [editing, setEditing] = useState<AuthAccount | null>(null)
  const [editEmail, setEditEmail] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editError, setEditError] = useState('')
  const [removing, setRemoving] = useState<AuthAccount | null>(null)
  const [approved, setApproved] = useState<AuthAccount | null>(null)

  const pending = accounts.filter((a) => a.status === 'pending')
  const active = accounts.filter((a) => a.status === 'active')

  const rows = useMemo(() => {
    return accounts.filter((a) => {
      const matchesStatus = filter === 'all' || a.status === filter
      const matchesRole = roleFilter === 'all' || a.role === roleFilter
      return matchesStatus && matchesRole
    })
  }, [accounts, filter, roleFilter])

  const columns: Array<Column<AuthAccount>> = [
    {
      key: 'name',
      header: 'Account',
      render: (a) => (
        <span className="flex items-center gap-2.5">
          <span className="rounded-full bg-brand-50 p-2">
            {a.role === 'customer' ? <ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden /> : <UserCheck className="h-4 w-4 text-brand-600" aria-hidden />}
          </span>
          <span className="min-w-0">
            <span className="block font-medium text-slate-900">{a.name}</span>
            <span className="block truncate text-xs text-slate-400">{a.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (a) => <Badge tone={a.role === 'customer' ? 'brand' : 'info'}>{a.role === 'customer' ? 'Customer' : 'Technician'}</Badge>,
    },
    {
      key: 'detail',
      header: 'Profile',
      render: (a) =>
        a.role === 'customer' ? (
          <span>
            <span className="flex flex-wrap gap-1">
              {(a.serviceTypes ?? []).length === 0 ? (
                <span className="text-slate-400">—</span>
              ) : (
                (a.serviceTypes ?? []).map((s) => <Badge key={s} tone="brand">{s}</Badge>)
              )}
            </span>
            {a.company && <span className="mt-0.5 block text-xs text-slate-400">{a.company}</span>}
          </span>
        ) : (
          <span>
            <span className="block text-slate-600">{a.technicianId ?? 'Pending profile'}</span>
            <span className="mt-1 flex flex-wrap items-center gap-1">
              {(a.serviceTypes ?? []).length === 0 ? (
                <span className="text-xs text-slate-400">No service types recorded</span>
              ) : (
                (a.serviceTypes ?? []).map((s) => <Badge key={s} tone="brand">{s}</Badge>)
              )}
              <button
                type="button"
                onClick={() => { setSkillDraft((a.serviceTypes ?? []) as ServiceTypeKey[]); setSkillsFor(a) }}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                Edit skills
              </button>
            </span>
          </span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => <Badge tone={statusTone[a.status]}>{a.status === 'active' ? 'Active' : a.status === 'pending' ? 'Pending' : 'Rejected'}</Badge>,
    },
    {
      key: 'requested',
      header: 'Requested',
      render: (a) => (
        <span className="text-slate-600">
          {formatDate(a.requestedAt)}
          <span className="block text-xs text-slate-400">{timeAgo(a.requestedAt)}</span>
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (a) =>
        a.status === 'pending' ? (
          <span className="flex items-center justify-end gap-2">
            <Button size="sm" variant="success" icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => handleApprove(a)}>
              Approve
            </Button>
            <Button size="sm" variant="outline" icon={<XCircle className="h-3.5 w-3.5 text-red-500" />} onClick={() => {
              setRejecting(a)
              setRejectNote('')
            }}>
              Reject
            </Button>
          </span>
        ) : (
          <span className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => {
              setEditing(a)
              setEditEmail(a.email)
              setEditPassword(a.password)
              setEditError('')
            }}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 hover:bg-red-50"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => setRemoving(a)}
            >
              Remove
            </Button>
          </span>
        ),
    },
  ]

  const doReject = () => {
    if (!rejecting) return
    rejectAccount(rejecting.id, rejectNote.trim() || undefined)
    toast(`Signup request from ${rejecting.name} was rejected.`)
    setRejecting(null)
  }

  const doUpdate = () => {
    if (!editing) return
    const result = updateAccount(editing.id, { email: editEmail, password: editPassword })
    if (!result.ok) {
      setEditError(result.message ?? 'Could not update the account.')
      return
    }
    toast(`${editing.name}'s sign-in details updated.`)
    setEditing(null)
  }

  const doRemove = () => {
    if (!removing) return
    deleteAccount(removing.id)
    toast(`${removing.name} was removed${removing.role === 'customer' ? ' (customer profile and tied records deleted)' : ''}.`)
    setRemoving(null)
  }

  const saveSkills = async () => {
    if (!skillsFor) return
    setSavingSkills(true)
    const res = await setTechnicianSkills(skillsFor.id, skillDraft)
    setSavingSkills(false)
    if (!res.ok) { toast(res.message ?? 'Could not save skills.'); return }
    setSkillsFor(null)
    toast(`${skillsFor.name}'s service types were updated.`)
  }

  const doDismissApproved = () => {
    setApproved(null)
    setFilter('active')
  }

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle="Customers and technicians who signed up through the portal. Pending requests need approval before the account can sign in."
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Pending approvals" value={pending.length} sub="awaiting action" icon={Clock} tone="warning" />
        <StatCard label="Active accounts" value={active.length} sub="customers + technicians" icon={UserCheck} tone="success" />
        <StatCard label="Rejected" value={accounts.filter((a) => a.status === 'rejected').length} sub="not approved" tone="danger" />
      </div>

      <Card bodyClassName="p-0">
        <div className="border-b border-slate-100 px-5 pt-4">
          <Tabs
            tabs={[
              { id: 'pending', label: 'Pending', count: pending.length },
              { id: 'active', label: 'Active', count: active.length },
              { id: 'rejected', label: 'Rejected', count: accounts.filter((a) => a.status === 'rejected').length },
              { id: 'all', label: 'All', count: accounts.length },
            ]}
            active={filter}
            onChange={(id) => setFilter(id as Filter)}
          />
          <div className="flex flex-wrap gap-2 py-3">
            <Button size="sm" variant={roleFilter === 'all' ? 'primary' : 'outline'} onClick={() => setRoleFilter('all')}>
              All roles ({accounts.length})
            </Button>
            <Button size="sm" variant={roleFilter === 'customer' ? 'primary' : 'outline'} onClick={() => setRoleFilter('customer')}>
              Customers ({accounts.filter((a) => a.role === 'customer').length})
            </Button>
            <Button size="sm" variant={roleFilter === 'technician' ? 'primary' : 'outline'} onClick={() => setRoleFilter('technician')}>
              Technicians ({accounts.filter((a) => a.role === 'technician').length})
            </Button>
          </div>
        </div>
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(a) => a.id}
          empty={<span className="block py-10 text-center text-sm text-slate-400">No {roleFilter === 'all' ? '' : `${roleFilter} `}{filter} signups.</span>}
        />
      </Card>

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={`Reject ${rejecting?.name ?? ''}`}
        description="This person will receive an email and will not be able to sign in."
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="danger" icon={<XCircle className="h-4 w-4" />} onClick={doReject}>Confirm rejection</Button>
          </>
        }
      >
        <Textarea
          label="Reason (optional)"
          value={rejectNote}
          onChange={(e) => setRejectNote(e.target.value)}
          placeholder="e.g. Business not verified"
        />
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={`Edit ${editing?.name ?? ''}`}
        description="Update the sign-in email or reset the password. Changes take effect immediately."
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button icon={<CheckCircle2 className="h-4 w-4" />} onClick={doUpdate}>Save changes</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Sign-in email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
          <Input
            label="Password"
            type="text"
            value={editPassword}
            onChange={(e) => setEditPassword(e.target.value)}
            hint="Minimum 6 characters. Leave as-is unless you want to reset it."
          />
          {editError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{editError}</p>
          )}
        </div>
      </Modal>

      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? ''}`}
        description={
          removing?.role === 'customer'
            ? 'This will delete the account AND its customer profile, AMC contracts, services, complaints and payments. This cannot be undone.'
            : 'This technician will no longer be able to sign in. This cannot be undone.'
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={doRemove}>Remove permanently</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {removing &&
            (removing.role === 'customer'
              ? `Customer ${removing.id} — ${removing.name} (${removing.email})`
              : `Technician ${removing.id} — ${removing.name} (${removing.email})`)}
        </p>
      </Modal>

      <Modal
        open={skillsFor !== null}
        onClose={() => setSkillsFor(null)}
        title={`Service types — ${skillsFor?.name ?? ''}`}
        description="What this technician is trained to work on. Dispatch uses this to suggest who can take a job."
        footer={
          <>
            <Button variant="outline" onClick={() => setSkillsFor(null)}>Cancel</Button>
            <Button onClick={saveSkills} loading={savingSkills}>Save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {SERVICE_TYPES.map((t) => {
              const on = skillDraft.includes(t)
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSkillDraft((prev) => (on ? prev.filter((x) => x !== t) : [...prev, t as ServiceTypeKey]))}
                  className={`rounded-md border px-2.5 py-1 text-sm transition ${
                    on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-slate-500">
            {skillDraft.length === 0
              ? 'No service types selected. This technician is treated as able to take any job, so an empty list does not hide them from dispatch.'
              : `${skillDraft.length} selected.`}
          </p>
        </div>
      </Modal>

      <Modal
        open={approved !== null}
        onClose={doDismissApproved}
        title="Approved successfully"
        footer={<Button className="w-full justify-center" onClick={doDismissApproved}>Done</Button>}
      >
        <div className="flex items-start gap-3">
          <span className="rounded-full bg-emerald-100 p-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-emerald-800">
              {approved?.name} is now an active {approved?.role === 'customer' ? 'customer' : 'technician'}.
            </p>
            <p className="text-sm text-slate-600">
              {approved?.role === 'customer'
                ? 'A customer profile with one AMC per selected service was created.' : 'The technician can now sign in with their account.'}
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
