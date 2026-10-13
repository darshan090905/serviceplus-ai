import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store/AppStore'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { formatDate, daysFromNow } from '../../utils/dates'
import { formatINR } from '../../utils/format'
import { CreditCard, PieChart as PieIcon, Smartphone, Landmark, ShieldCheck, ScanLine } from 'lucide-react'
import type { Payment, PaymentMethod } from '../../types'
import { useToast } from '../../components/ui/Toast'
import { isSupabaseConfigured } from '../../services/supabase'
import { QRCodeSVG } from 'qrcode.react'
import { SuccessAnimation } from '../../components/payments/SuccessAnimation'

const DONUT_COLORS = { Paid: '#10b981', Pending: '#f59e0b', Overdue: '#ef4444' }
const PAYMENT_OPTIONS: PaymentMethod[] = ['UPI', 'Net Banking', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Cash']

function makeReferenceId(): string {
  const rand = () => Math.random().toString(36).slice(2, 10)
  return `sp_${Date.now().toString(36)}_${rand()}${rand()}`
}

export function PortalPaymentsPage() {
  const { session, payments, recordPayment, setPaymentReference } = useAppStore()
  const { toast } = useToast()
  const [payTarget, setPayTarget] = useState<Payment | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('UPI')
  const [paymentSuccess, setPaymentSuccess] = useState<Payment | null>(null)
  const succeeded = useRef<Set<string>>(new Set())

  const mine = useMemo(
    () => payments.filter((p) => p.customerId === session?.customerId).sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
    [payments, session?.customerId],
  )

  const totals = useMemo(
    () => ({
      pending: mine.filter((p) => p.status === 'Pending' || p.status === 'Partially Paid').reduce((s, p) => s + p.amount, 0),
      overdue: mine.filter((p) => p.status === 'Overdue').reduce((s, p) => s + p.amount, 0),
      paid: mine.filter((p) => p.status === 'Paid').reduce((s, p) => s + p.amount, 0),
    }),
    [mine],
  )

  const donutData = useMemo(
    () => [
      { name: 'Paid', value: totals.paid },
      { name: 'Pending', value: totals.pending },
      { name: 'Overdue', value: totals.overdue },
    ].filter((d) => d.value > 0),
    [totals],
  )

  const openPayFlow = async (payment: Payment, method: PaymentMethod = 'UPI') => {
    // New payment requests are born with a scannable reference. Older/seed
    // invoices assign one on demand — the write must be confirmed before the
    // QR is shown, otherwise the phone's public page can't resolve it.
    if (!payment.referenceId && isSupabaseConfigured()) {
      const ref = makeReferenceId()
      const ok = await setPaymentReference(payment.id, ref)
      if (!ok) {
        toast('Could not create the payment link. Please sign out and back in, then try again.', 'error')
        return
      }
      payment = { ...payment, referenceId: ref }
    }
    setSelectedMethod(method)
    setPayTarget(payment)
  }

  const confirmPayment = () => {
    if (!payTarget) return

    recordPayment(payTarget.id, {
      status: 'Paid',
      paidDate: daysFromNow(0),
      method: selectedMethod,
    })
    succeeded.current.add(payTarget.id)

    setPaymentSuccess(payTarget)
    setPayTarget(null)
    toast('Payment successful. Your invoice is now marked as paid.', 'success')
  }

  // Live cross-device completion: when the invoice flips to Paid (scan →
  // phone pays → Supabase Realtime), pop the success modal automatically
  // on the tab that opened the checkout.
  const checkoutUrl = useMemo(() => {
    if (!payTarget?.referenceId || !isSupabaseConfigured()) return ''
    const host = window.location.hostname
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1'
    const base = isLocal ? import.meta.env.VITE_APP_URL || window.location.origin : window.location.origin
    return `${base}/pay/${payTarget.referenceId}`
  }, [payTarget?.referenceId])

  useEffect(() => {
    if (!payTarget) return
    const mine = payments.find((p) => p.id === payTarget.id)
    if (mine?.status === 'Paid' && !succeeded.current.has(mine.id)) {
      succeeded.current.add(mine.id)
      setPaymentSuccess(mine)
      setPayTarget(null)
      toast('Payment successful. Your invoice is now marked as paid.', 'success')
    }
  }, [payments, payTarget, toast])

  const columns: Array<Column<Payment>> = [
    { key: 'invoice', header: 'Invoice', render: (p) => <span className="font-medium text-slate-900">{p.invoice}</span> },
    { key: 'amount', header: 'Amount', align: 'right', render: (p) => <span className="font-medium">{formatINR(p.amount)}</span> },
    { key: 'due', header: 'Due Date', render: (p) => formatDate(p.dueDate) },
    { key: 'paid', header: 'Paid Date', render: (p) => (p.paidDate ? formatDate(p.paidDate) : <span className="text-slate-300">—</span>) },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge kind="payment" value={p.status} /> },
    { key: 'method', header: 'Method', render: (p) => p.method },
    {
      key: 'gateway',
      header: <span className="inline-block w-24" aria-hidden />,
      align: 'right',
      className: 'w-28',
      render: (p) =>
        p.status === 'Paid' ? (
          <span className="inline-flex h-8 items-center justify-end text-slate-400">Cleared</span>
        ) : (
          <span className="inline-flex h-8 items-center justify-end">
            <Button size="sm" variant="success" className="min-w-24 justify-center" onClick={() => openPayFlow(p)}>Pay Now</Button>
          </span>
        ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="My Payments"
        subtitle="Invoices and payment status for your account."
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Outstanding" value={formatINR(totals.pending)} sub="pending invoices" icon={CreditCard} tone="warning" />
        <StatCard label="Overdue" value={formatINR(totals.overdue)} sub="requires attention" tone="danger" />
        <StatCard label="Paid to date" value={formatINR(totals.paid)} sub="cleared payments" tone="success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white shadow-card">
          {mine.length === 0 ? (
            <EmptyState title="No invoices" description="Your payments will appear here." />
          ) : (
            <DataTable columns={columns} data={mine} rowKey={(p) => p.id} />
          )}
        </div>
        <Card title={<span className="flex items-center gap-1.5"><PieIcon className="h-4 w-4 text-brand-500" aria-hidden /> Payment Split</span>} description="Where your billed amount stands">
          {donutData.length === 0 ? (
            <p className="text-sm text-slate-400">No invoices yet.</p>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={3} strokeWidth={0}>
                    {donutData.map((d) => (
                      <Cell key={d.name} fill={DONUT_COLORS[d.name as keyof typeof DONUT_COLORS]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number | string) => formatINR(Number(v))} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Legend iconSize={10} formatter={(v) => <span className="text-xs text-slate-600">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <ul className="mt-2 space-y-1.5 text-sm">
            <li className="flex justify-between"><span className="flex items-center gap-1.5 text-slate-500"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden /> Paid</span><span className="font-medium text-emerald-600">{formatINR(totals.paid)}</span></li>
            <li className="flex justify-between"><span className="flex items-center gap-1.5 text-slate-500"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden /> Pending</span><span className="font-medium text-amber-600">{formatINR(totals.pending)}</span></li>
            <li className="flex justify-between"><span className="flex items-center gap-1.5 text-slate-500"><span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden /> Overdue</span><span className="font-medium text-red-600">{formatINR(totals.overdue)}</span></li>
          </ul>
        </Card>
      </div>

      <Modal
        open={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        title="Pay invoice"
        description="Choose how you want to pay this bill."
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setPayTarget(null)}>Cancel</Button>
            <Button onClick={confirmPayment}>Confirm Payment</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Invoice</p>
                <p className="text-lg font-semibold text-slate-900">{payTarget?.invoice}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
                <p className="text-xl font-bold text-slate-900">{payTarget ? formatINR(payTarget.amount) : ''}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {PAYMENT_OPTIONS.map((method) => {
              const Icon = method === 'UPI'
                ? Smartphone
                : method === 'Net Banking' || method === 'Bank Transfer'
                  ? Landmark
                  : method.includes('Card')
                    ? ShieldCheck
                    : CreditCard

              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => setSelectedMethod(method)}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${selectedMethod === method ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
                >
                  <span className="rounded-lg bg-slate-100 p-2 text-slate-700">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="font-medium">{method}</span>
                </button>
              )
            })}
          </div>

          <div className="rounded-2xl border border-dashed border-brand-200 bg-brand-50 p-4">
            <div className="mb-3 flex items-center justify-between text-sm text-brand-700">
              <span className="font-medium">{selectedMethod} payment</span>
              <span>Demo gateway</span>
            </div>

            {selectedMethod === 'UPI' ? (
              <div className="space-y-3 text-center">
                <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-2xl border-2 border-dashed border-brand-300 bg-white p-2">
                  {checkoutUrl ? (
                    <QRCodeSVG value={checkoutUrl} size={144} level="M" fgColor="#0f172a" bgColor="#ffffff" includeMargin={false} />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Smartphone className="h-8 w-8 text-brand-400" />
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Pay to</p>
                  <p className="text-base font-semibold text-slate-800">servicepulse@upi</p>
                </div>
                <p className="text-sm text-slate-600">Amount: <span className="font-semibold text-slate-900">{payTarget ? formatINR(payTarget.amount) : ''}</span></p>
                {checkoutUrl && (
                  <div className="space-y-2">
                    <p className="mx-auto flex items-start gap-1.5 rounded-lg bg-brand-50 px-3 py-2 text-left text-xs text-brand-700">
                      <ScanLine className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Scan this QR with your phone camera from any network or Wi-Fi to open the payment page and complete the checkout.
                    </p>
                    <a href={checkoutUrl} target="_blank" rel="noreferrer" className="block rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 hover:text-brand-600">
                      <span className="font-medium text-slate-600">Test link:</span> {checkoutUrl}
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                  <p className="font-medium text-slate-800">Secure {selectedMethod}</p>
                  <p className="mt-1">Total payable: <span className="font-semibold text-slate-900">{payTarget ? formatINR(payTarget.amount) : ''}</span></p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                  <p>Bank / card details are shown in demo mode. Click confirm to simulate successful payment.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(paymentSuccess)}
        onClose={() => setPaymentSuccess(null)}
        title="Payment successful"
        description="Your payment has been processed successfully."
        size="sm"
        footer={<Button className="w-full justify-center bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-700" onClick={() => setPaymentSuccess(null)}>Done</Button>}
      >
        <div className="relative overflow-hidden rounded-2xl">
          <div className="absolute inset-x-8 top-0 h-20 rounded-full bg-emerald-200/70 blur-3xl" />
          <div className="relative space-y-5 text-center">
            <div className="mx-auto flex w-24 items-center justify-center">
              <SuccessAnimation size={96} />
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                Transaction complete
              </span>
              <p className="text-3xl font-black tracking-tight text-slate-900">{paymentSuccess ? formatINR(paymentSuccess.amount) : ''}</p>
              <p className="text-sm font-medium text-slate-600">Paid via {selectedMethod}</p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-4 text-left shadow-sm">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-500">Invoice</span>
                <span className="font-semibold text-slate-900">{paymentSuccess?.invoice}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-500">Status</span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Paid</span>
              </div>
            </div>

            <p className="text-sm leading-6 text-slate-600">
              Your payment is confirmed and the invoice is now visible to the admin team for record keeping.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}