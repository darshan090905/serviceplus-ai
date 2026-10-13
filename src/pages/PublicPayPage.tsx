import { useEffect, useState, type ReactNode } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Smartphone, Landmark, ShieldCheck, CheckCircle2, ArrowLeft, Loader2, AlertTriangle } from 'lucide-react'
import type { Payment, PaymentMethod } from '../types'
import { fetchPaymentByReference, completePayment } from '../services/supabase'
import { formatDate } from '../utils/dates'
import { formatINR } from '../utils/format'
import { SuccessAnimation } from '../components/payments/SuccessAnimation'
import { useAppStore } from '../store/AppStore'

const METHODS: Array<{ label: PaymentMethod; icon: typeof Smartphone }> = [
  { label: 'UPI', icon: Smartphone },
  { label: 'Credit Card', icon: ShieldCheck },
  { label: 'Net Banking', icon: Landmark },
]

const DEMO_PIN = '1234'

type LoadState = 'loading' | 'ready' | 'missing' | 'paid' | 'done' | 'error'

export function PublicPayPage() {
  const { refId = '' } = useParams<{ refId: string }>()
  const { sendPaymentConfirmation, payments } = useAppStore()
  const [payment, setPayment] = useState<Payment | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [method, setMethod] = useState<PaymentMethod>('UPI')
  const [paying, setPaying] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const found = await fetchPaymentByReference(refId)
      if (cancelled) return
      if (!found) {
        setState('missing')
        return
      }
      setPayment(found)
      setState(found.status === 'Paid' ? 'paid' : 'ready')
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [refId])

  const handlePay = async () => {
    if (!payment) return
    if (pin !== DEMO_PIN) {
      setPinError(true)
      return
    }
    setPaying(true)
    const ok = await completePayment(refId, method)
    setPaying(false)
    if (ok) {
      setState('done')
      // Send confirmation email to customer
      const stored = payments.find((p) => p.referenceId === refId || p.id === payment.id)
      if (stored) {
        sendPaymentConfirmation(stored.id)
      }
    } else {
      setState('error')
    }
  }

  const phoneShell = (content: ReactNode) => (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="rounded-t-3xl border-b border-slate-100 bg-brand-600 p-5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Payment Request</p>
              <p className="text-xs text-brand-100">ServicePulse • Pay your invoice</p>
            </div>
          </div>
        </div>
        <div className="p-5">{content}</div>
      </div>
    </div>
  )

  if (state === 'loading') {
    return phoneShell(
      <div className="flex flex-col items-center gap-3 py-10 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Loading payment details…</p>
      </div>,
    )
  }

  if (state === 'missing') {
    return phoneShell(
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <p className="font-medium text-slate-900">Payment not found</p>
        <p className="text-sm text-slate-500">This link is invalid or the invoice has expired.</p>
        <Link to="/" className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-700">Back to ServicePulse</Link>
      </div>,
    )
  }

  if (state === 'paid') {
    return phoneShell(
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <p className="text-lg font-semibold text-slate-900">Already paid</p>
        <p className="text-sm text-slate-500">Invoice {payment?.invoice} is already marked as paid.</p>
      </div>,
    )
  }

  if (state === 'done') {
    return phoneShell(
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <SuccessAnimation size={112} />
        <p className="animate-pay-bounce text-xl font-bold text-slate-900">Done! Payment successful</p>
        <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-sm">
          <div className="flex justify-between py-1"><span className="text-slate-500">Invoice</span><span className="font-medium text-slate-900">{payment?.invoice}</span></div>
          <div className="flex justify-between py-1"><span className="text-slate-500">Amount</span><span className="font-bold text-slate-900">{payment ? formatINR(payment.amount) : ''}</span></div>
          <div className="flex justify-between py-1"><span className="text-slate-500">Method</span><span className="font-medium text-slate-900">{method}</span></div>
          <div className="flex justify-between py-1"><span className="text-slate-500">Status</span><span className="font-medium text-emerald-600">Paid</span></div>
        </div>
        <p className="text-xs text-slate-500">A success notification has been sent to the service team.</p>
        <Link to="/" className="text-sm font-medium text-brand-600 hover:text-brand-700">Back to ServicePulse</Link>
      </div>,
    )
  }

  return phoneShell(
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Invoice</p>
            <p className="text-lg font-semibold text-slate-900">{payment?.invoice}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
            <p className="text-xl font-bold text-slate-900">{payment ? formatINR(payment.amount) : ''}</p>
          </div>
        </div>
        <div className="mt-1 flex justify-between text-xs text-slate-500">
          <span>Due {payment ? formatDate(payment.dueDate) : ''}</span>
          <span>Pay to: servicepulse@upi</span>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Pay using</p>
        <div className="grid grid-cols-3 gap-2">
          {METHODS.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => setMethod(label)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm transition ${method === label ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-700'}`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {state === 'error' && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">Payment could not be completed. Please try again.</p>
      )}

      <div>
        <label htmlFor="pay-pin" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Enter PIN to confirm
        </label>
        <div className="relative">
          <input
            id="pay-pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))
              setPinError(false)
            }}
            placeholder="••••"
            className={`w-full rounded-xl border bg-white px-4 py-3 text-lg font-semibold tracking-[0.5em] text-slate-900 outline-none transition focus:ring-2 ${pinError ? 'border-red-400 focus:ring-red-200' : 'border-slate-200 focus:border-brand-400 focus:ring-brand-200'}`}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span className="text-slate-400">Demo PIN: <span className="font-semibold text-slate-600">1234</span></span>
          {pinError && <span className="font-medium text-red-600">Incorrect PIN, try again</span>}
        </div>
      </div>

      <button
        type="button"
        onClick={handlePay}
        disabled={paying}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {paying ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</> : <><ArrowLeft className="h-4 w-4 rotate-180" /> Confirm &amp; Pay {payment ? formatINR(payment.amount) : ''}</>}
      </button>

      <p className="text-center text-xs text-slate-400">Demo gateway — no real money is charged.</p>
    </div>,
  )
}