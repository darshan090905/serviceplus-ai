import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, CreditCard, CheckCircle2, Send, Undo2, FileText } from 'lucide-react'
import type { Payment } from '../types'
import { useAppStore } from '../store/AppStore'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { StatCard } from '../components/ui/StatCard'
import { SearchInput } from '../components/ui/SearchInput'
import { DataTable, type Column } from '../components/ui/DataTable'
import { Pagination } from '../components/ui/Pagination'
import { Select } from '../components/ui/Field'
import { StatusBadge } from '../components/ui/StatusBadge'
import { EmptyState } from '../components/ui/EmptyState'
import { TableSkeleton } from '../components/ui/Skeleton'
import { FilterBar } from '../components/ui/FilterBar'
import { PaymentFormModal } from '../components/payments/PaymentFormModal'
import { PaymentRequestModal } from '../components/payments/PaymentRequestModal'
import { InvoiceFormModal } from '../components/invoices/InvoiceFormModal'
import { loadInvoices } from '../services/invoiceService'
import type { Invoice } from '../types'
import { useToast } from '../components/ui/Toast'
import { formatDate, daysFromNow } from '../utils/dates'
import { formatCompact, formatINR } from '../utils/format'
import { useDebouncedValue, useLoading } from '../hooks/useDebounce'

const PER_PAGE = 10

export function PaymentsPage() {
  const { payments, customers } = useAppStore()
  const { recordPayment, revertPayment } = useAppStore()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const [invoicing, setInvoicing] = useState<Payment | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const loading = useLoading(400)
  const debounced = useDebouncedValue(query)

  // Loaded rather than held in the store: invoices are a document, not part of
  // the app's live operating state, and nothing on this page edits them in
  // place. An empty list on a database without migration 004 is the honest
  // "no invoices raised" state rather than an error.
  useEffect(() => {
    void loadInvoices().then(setInvoices)
  }, [])

  const invoiceFor = (paymentId: string) => invoices.find((i) => i.paymentId === paymentId)

  const customerNames = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers])

  const kpis = useMemo(() => {
    const collected = payments.filter((p) => p.status === 'Paid').reduce((s, p) => s + p.amount, 0)
    const pending = payments.filter((p) => p.status === 'Pending' || p.status === 'Partially Paid').reduce((s, p) => s + p.amount, 0)
    const overdue = payments.filter((p) => p.status === 'Overdue').reduce((s, p) => s + p.amount, 0)
    const total = collected + pending + overdue
    const rate = total ? Math.round((collected / total) * 100) : 0
    return { collected, pending, overdue, rate }
  }, [payments])

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    return payments
      .filter((p) => {
        const customer = customerNames.get(p.customerId)
        if (q && !p.invoice.toLowerCase().includes(q) && !customer?.name.toLowerCase().includes(q)) return false
        if (statusFilter && p.status !== statusFilter) return false
        if (methodFilter && p.method !== methodFilter) return false
        if (dateFilter === 'future' && p.dueDate <= daysFromNow(0)) return false
        return true
      })
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
  }, [payments, debounced, customerNames, statusFilter, methodFilter, dateFilter])

  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const applied = [debounced, statusFilter, methodFilter, dateFilter].filter(Boolean).length

  const reset = () => {
    setQuery(''); setStatusFilter(''); setMethodFilter(''); setDateFilter(''); setPage(1)
  }

  const markPaid = (p: Payment) => {
    recordPayment(p.id, { status: 'Paid', paidDate: daysFromNow(0) })
    toast(`${p.invoice} marked as paid.`)
  }

  const revert = (p: Payment) => {
    revertPayment(p.id)
    toast(`${p.invoice} request reverted and removed from the customer's account.`, 'info')
  }

  const columns: Array<Column<Payment>> = [
    {
      key: 'invoice',
      header: 'Invoice',
      // `p.invoice` is a free-text label the app has always carried. When a real
      // invoice has been raised for this payment, link to the printable one and
      // say so, rather than implying the label is a document.
      render: (p) => {
        const raised = invoiceFor(p.id)
        return raised ? (
          <button
            className="text-left font-medium text-brand-700 hover:underline"
            onClick={(e) => { e.stopPropagation(); navigate(`/invoices/${raised.id}`) }}
            title={`Open GST invoice ${raised.number}`}
          >
            {raised.number}
          </button>
        ) : (
          <span className="font-medium text-slate-900">{p.invoice}</span>
        )
      },
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (p) => (
        <button className="text-left font-medium text-slate-800 hover:text-brand-700" onClick={(e) => { e.stopPropagation(); navigate(`/customers/${p.customerId}`) }}>
          {customerNames.get(p.customerId)?.name}
        </button>
      ),
    },
    { key: 'amc', header: 'AMC', render: (p) => (p.amcId ? <span className="text-slate-500">{p.amcId}</span> : <span className="text-slate-300">—</span>) },
    { key: 'amount', header: 'Amount', align: 'right', render: (p) => <span className="font-semibold text-slate-900">{formatINR(p.amount)}</span> },
    { key: 'due', header: 'Due Date', render: (p) => formatDate(p.dueDate) },
    { key: 'paid', header: 'Paid Date', render: (p) => (p.paidDate ? formatDate(p.paidDate) : <span className="text-slate-300">—</span>) },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge kind="payment" value={p.status} /> },
    { key: 'method', header: 'Payment Method', render: (p) => p.method },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) =>
        p.status === 'Pending' || p.status === 'Overdue' ? (
          <div className="flex items-center justify-end gap-2">
            {!invoiceFor(p.id) && (
              <Button
                size="sm"
                variant="outline"
                icon={<FileText className="h-3.5 w-3.5" />}
                title={`Raise a GST invoice for ${p.invoice}`}
                onClick={(e) => { e.stopPropagation(); setInvoicing(p) }}
              >
                Invoice
              </Button>
            )}
            <Button
              size="sm"
              variant="success"
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              onClick={(e) => { e.stopPropagation(); markPaid(p) }}
            >
              {p.status === 'Overdue' ? 'Collect' : 'Mark Paid'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-slate-500 hover:text-red-600 hover:border-red-200"
              icon={<Undo2 className="h-3.5 w-3.5" />}
              title={`Revert ${p.invoice}`}
              onClick={(e) => { e.stopPropagation(); revert(p) }}
            >
              Revert
            </Button>
          </div>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Track collections, outstanding invoices and overdue payments."
        actions={
          <>
            <Button variant="outline" icon={<Send className="h-4 w-4" />} onClick={() => setRequestOpen(true)}>
              Send Payment Request
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModalOpen(true)}>
              Record Payment
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Collected" value={formatCompact(kpis.collected)} icon={CreditCard} tone="success" />
        <StatCard label="Pending" value={formatCompact(kpis.pending)} sub="not yet received" tone="warning" />
        <StatCard label="Overdue" value={formatCompact(kpis.overdue)} sub="needs follow-up" tone="danger" />
        <StatCard label="Collection Rate" value={`${kpis.rate}%`} sub="of all recorded invoices" tone="brand" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-100 p-4">
          <div className="flex flex-col gap-3">
            <SearchInput value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder="Search invoice or customer..." className="max-w-md" />
            <FilterBar applied={applied} onReset={reset}>
              <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} options={[{ value: '', label: 'All Status' }, ...['Paid', 'Pending', 'Overdue', 'Partially Paid'].map((s) => ({ value: s, label: s }))]} className="w-40" />
              <Select value={methodFilter} onChange={(e) => { setMethodFilter(e.target.value); setPage(1) }} options={[{ value: '', label: 'All Methods' }, ...['UPI', 'Net Banking', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Cash', 'Card', 'Cheque'].map((s) => ({ value: s, label: s }))]} className="w-52" />
              <Select value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); setPage(1) }} options={[{ value: '', label: 'Due (any)' }, { value: 'future', label: 'Due in future' }]} className="w-40" />
            </FilterBar>
          </div>
        </div>
        {loading ? (
          <TableSkeleton rows={6} columns={8} />
        ) : (
          <DataTable
            columns={columns}
            data={pageRows}
            rowKey={(p) => p.id}
            empty={<EmptyState title="No payments found" description="Try adjusting your filters." action={<Button variant="outline" size="sm" onClick={reset}>Clear Filters</Button>} />}
          />
        )}
        {!loading && filtered.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3">
            <Pagination page={page} perPage={PER_PAGE} total={filtered.length} onChange={setPage} />
          </div>
        )}
      </div>

      <PaymentFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <PaymentRequestModal open={requestOpen} onClose={() => setRequestOpen(false)} />
      <InvoiceFormModal
        // Keyed on the payment so React remounts the form for each invoice. The
        // modal also resets itself on open, but the key is what guarantees no
        // field survives from the previous one, including the place of supply.
        key={invoicing?.id ?? 'new-invoice'}
        open={invoicing !== null}
        onClose={() => { setInvoicing(null); void loadInvoices().then(setInvoices) }}
        customerId={invoicing?.customerId}
        paymentId={invoicing?.id}
        amcId={invoicing?.amcId || undefined}
        amount={invoicing?.amount}
        description={
          invoicing
            ? `${invoicing.invoice} — ${invoicing.method} payment due ${formatDate(invoicing.dueDate)}`
            : undefined
        }
      />
    </div>
  )
}