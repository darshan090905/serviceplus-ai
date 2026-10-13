import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { useAppStore } from '../store/AppStore'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { DetailSkeleton } from '../components/ui/Skeleton'
import { useLoading } from '../hooks/useDebounce'
import { formatINRExact } from '../utils/format'
import { toRupees } from '../utils/money'
import { BUSINESS, stateNameByCode } from '../utils/gst'
import { loadInvoice } from '../services/invoiceService'
import type { Invoice } from '../types'

/**
 * A printable, GST-shaped invoice.
 *
 * `print:hidden` on the chrome and a print stylesheet that strips the rest is
 * the whole implementation. A PDF library would be a dependency, a bundle cost
 * and a separate thing to keep in sync with this markup, to produce bytes the
 * browser can already produce exactly as well.
 */
export function InvoicePage() {
  const { id } = useParams<{ id: string }>()
  const { customers, session } = useAppStore()
  const loading = useLoading(250)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!id) return
    void loadInvoice(id).then((i) => {
      setInvoice(i)
      setMissing(!i)
    })
  }, [id])

  if (loading) return <DetailSkeleton />
  if (missing || !invoice) {
    return (
      <div>
        <BackLink />
        <Card className="p-10"><EmptyState title="Invoice not found" description="It may have been issued against a different number, or the database has not had migration 004 applied." /></Card>
      </div>
    )
  }

  const customer = customers.find((c) => c.id === invoice.customerId)
  // A customer may reach this page by guessing a sequential invoice number, so
  // the check has to be an actual comparison against the session.
  //
  // It deliberately does not fall back to `customer.id`. That fallback made the
  // condition tautological: with no session customer id, the right-hand side
  // became the invoice's own customer, so `ownInvoice` was true for every
  // invoice and the page below was reached by anyone. A missing identity is not
  // a match; it is an absence of one.
  const ownInvoice =
    session?.role === 'admin' || (session?.customerId != null && invoice.customerId === session.customerId)
  if (!ownInvoice) {
    return (
      <div>
        <BackLink />
        <Card className="p-10"><EmptyState title="Invoice not found" /></Card>
      </div>
    )
  }

  const balance = invoice.totalPaise - invoice.amountPaidPaise
  const amountInWords = numberToWords(invoice.totalPaise)

  return (
    <div>
      <div className="print:hidden">
        <BackLink />
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Invoice {invoice.number}
              {BUSINESS.isDemoBusiness && (
                <span className="ml-2 align-middle text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Demo — not a tax invoice
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-500">{customer?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {balance > 0 ? <Badge tone="warning">Balance {formatINRExact(toRupees(balance))}</Badge> : <Badge tone="success">Paid in full</Badge>}
            <Button onClick={() => window.print()} icon={<Printer className="h-4 w-4" />}>Print / Save PDF</Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 shadow-card print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-5">
          <div>
            <p className="text-base font-bold text-slate-900">{BUSINESS.legalName}</p>
            <p className="mt-0.5 text-xs text-slate-500">{BUSINESS.address}</p>
            <p className="text-xs text-slate-500">{BUSINESS.email} · {BUSINESS.phone}</p>
            <p className="mt-1 text-xs text-slate-600">
              State: {BUSINESS.stateName} ({BUSINESS.stateCode})
            </p>
            {/* A blank GSTIN is stated as blank. Inventing a well-formed number
                would be a fabricated tax registration, which is a compliance
                problem and not a cosmetic one. */}
            <p className="text-xs font-medium text-slate-600">
              GSTIN: {BUSINESS.gstin || <span className="font-normal text-amber-700">{BUSINESS.isDemoBusiness ? 'none — demo, not GST registered' : 'not configured'}</span>}
            </p>
          </div>
          <div className="text-right">
            {/* The document is not called a "Tax Invoice" while the supplier has
                no GSTIN, because that label is the claim being made. A demo that
                keeps the heading is a demo that invites being filed. */}
            <p className="text-xs uppercase tracking-wide text-slate-400">
              {BUSINESS.isDemoBusiness ? 'Demo Invoice' : 'Tax Invoice'}
            </p>
            <p className="text-base font-bold text-slate-900">{invoice.number}</p>
            <p className="mt-1 text-xs text-slate-500">Issued {invoice.issuedOn}</p>
            {invoice.dueOn && <p className="text-xs text-slate-500">Due {invoice.dueOn}</p>}
          </div>
        </header>

        {/* The notice is on the document itself, not behind a screen, so it
            survives being printed, saved as a PDF, or screenshotted on its own. */}
        {BUSINESS.isDemoBusiness && (
          <div className="mt-4 border-2 border-amber-400 bg-amber-50 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-900">
              Demo document — not a valid GST tax invoice
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
              ServicePulse is a demonstration project, not a GST-registered business, so no GSTIN is
              quoted and this document is not legally valid, cannot be filed, and carries no tax
              credit. The CGST/SGST/IGST figures below are illustrative only, computed at the stated
              rate so the arithmetic is realistic. Do not submit this to a customer, an auditor or
              the tax department.
            </p>
          </div>
        )}

        <section className="grid grid-cols-2 gap-6 border-b border-slate-200 py-5">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">Billed to</p>
            <p className="text-sm font-medium text-slate-900">{customer?.name}</p>
            {customer?.company && <p className="text-xs text-slate-600">{customer.company}</p>}
            {customer?.address && <p className="text-xs text-slate-500">{customer.address}</p>}
            {customer?.city && <p className="text-xs text-slate-500">{customer.city}</p>}
            <p className="mt-1 text-xs text-slate-600">
              GSTIN: {customer?.gstin || <span className="text-slate-400">unregistered (B2C)</span>}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">Place of supply</p>
            <p className="text-sm text-slate-800">
              {invoice.placeOfSupply ? `${stateNameByCode(invoice.placeOfSupply)} (${invoice.placeOfSupply})` : 'Not stated'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {invoice.interState
                ? 'Inter-state supply — IGST charged'
                : `Intra-state supply — CGST and SGST charged at ${(invoice.taxRate / 2).toFixed(0)}% each`}
            </p>
          </div>
        </section>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2 pr-2 font-medium">#</th>
              <th className="py-2 pr-2 font-medium">Description</th>
              <th className="py-2 pr-2 font-medium">SAC</th>
              <th className="py-2 pr-2 text-right font-medium">Qty</th>
              <th className="py-2 pr-2 text-right font-medium">Rate</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.lines.map((l, i) => (
              <tr key={l.id}>
                <td className="py-2 pr-2 text-slate-400">{i + 1}</td>
                <td className="py-2 pr-2 text-slate-800">{l.description}</td>
                <td className="py-2 pr-2 text-slate-500">{l.hsnSac || '—'}</td>
                <td className="py-2 pr-2 text-right text-slate-600">{l.quantity}</td>
                <td className="py-2 pr-2 text-right text-slate-600">{formatINRExact(toRupees(l.unitPricePaise))}</td>
                <td className="py-2 text-right font-medium text-slate-900">{formatINRExact(toRupees(l.lineTotalPaise))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-5 flex justify-end">
          <dl className="w-64 space-y-1.5 text-sm">
            <Row label="Subtotal" value={formatINRExact(toRupees(invoice.subtotalPaise))} />
            {invoice.discountPaise > 0 && <Row label="Discount" value={`- ${formatINRExact(toRupees(invoice.discountPaise))}`} />}
            {invoice.interState ? (
              <Row label={`IGST @ ${invoice.taxRate}%`} value={formatINRExact(toRupees(invoice.igstPaise))} />
            ) : (
              <>
                <Row label={`CGST @ ${invoice.taxRate / 2}%`} value={formatINRExact(toRupees(invoice.cgstPaise))} />
                <Row label={`SGST @ ${invoice.taxRate / 2}%`} value={formatINRExact(toRupees(invoice.sgstPaise))} />
              </>
            )}
            <div className="border-t border-slate-200 pt-1.5">
              <Row label="Total" value={formatINRExact(toRupees(invoice.totalPaise))} strong />
            </div>
            {invoice.amountPaidPaise > 0 && <Row label="Received" value={`- ${formatINRExact(toRupees(invoice.amountPaidPaise))}`} />}
            {balance > 0 && <Row label="Balance due" value={formatINRExact(toRupees(balance))} strong />}
            {/* Labelled at the point of use, not only in the header, because this
                is where a reader looks to decide whether the tax is real. */}
            {BUSINESS.isDemoBusiness && (
              <p className="pt-1 text-right text-[10px] leading-snug text-amber-700">
                Tax breakdown is illustrative, not a tax charge.
              </p>
            )}
          </dl>
        </section>

        <section className="mt-5 border-t border-slate-200 pt-3">
          <p className="text-xs text-slate-500">
            <span className="font-medium text-slate-600">Amount in words: </span>
            {amountInWords}
          </p>
          {invoice.notes && <p className="mt-2 text-xs text-slate-500">{invoice.notes}</p>}
          {!BUSINESS.gstin && (
            <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
              This invoice is not a valid GST document until the supplier GSTIN is configured in
              src/utils/gst.ts.
            </p>
          )}
        </section>

        <footer className="mt-8 flex justify-between gap-8 text-[11px] text-slate-400">
          {BUSINESS.isDemoBusiness ? (
            /* Repeated at the foot as well as in the header, so a page whose top
               has been cropped still carries the disclaimer. */
            <p>Demo document. Not a valid GST tax invoice. No tax credit applies.</p>
          ) : (
            <p>Computer-generated document. No signature required.</p>
          )}
          <p>For {BUSINESS.legalName}</p>
        </footer>
      </div>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className={strong ? 'font-semibold text-slate-800' : 'text-slate-500'}>{label}</dt>
      <dd className={strong ? 'font-semibold text-slate-900' : 'text-slate-700'}>{value}</dd>
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/payments" className="print:hidden mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600">
      <ArrowLeft className="h-4 w-4" /> Payments
    </Link>
  )
}

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

/**
 * Indian numbering in words, as a GST invoice has to show.
 *
 * The lakh/crore grouping is the reason this is hand-written rather than
 * Intl: `1180` is "one thousand one hundred eighty" everywhere except India,
 * where the invoice says "one thousand one hundred eighty" too, but
 * `100000` is "one lakh", not "one hundred thousand".
 */
export function numberToWords(paise: number): string {
  const rupees = Math.floor(Math.abs(paise) / 100)
  const remainder = Math.abs(paise) % 100
  const prefix = paise < 0 ? 'minus ' : ''
  if (rupees === 0 && remainder === 0) return `${prefix}rupees zero only`
  const parts: string[] = []
  const crore = Math.floor(rupees / 1_00_00_000)
  const lakh = Math.floor((rupees % 1_00_00_000) / 1_00_000)
  const thousand = Math.floor((rupees % 1_00_000) / 1000)
  const hundred = Math.floor((rupees % 1000) / 100)
  const rest = rupees % 100
  if (crore) parts.push(`${belowThousand(crore)} crore`)
  if (lakh) parts.push(`${belowThousand(lakh)} lakh`)
  if (thousand) parts.push(`${belowThousand(thousand)} thousand`)
  if (hundred) parts.push(`${ONES[hundred]} hundred`)
  if (rest) parts.push(belowThousand(rest))
  return `${prefix}rupees ${parts.join(' ')}${remainder ? ` and ${remainder} paise` : ''} only`
}

function belowThousand(n: number): string {
  if (n < 20) return ONES[n]
  const t = Math.floor(n / 10)
  const o = n % 10
  return `${TENS[t]}${o ? ` ${ONES[o]}` : ''}`
}
