import type { AIComplaintAnalysis, Complaint, Customer, RenewalEmail, RetentionAction } from '../types'
import { post, delay, delayError } from './api'

const sentimentKeywords = ['not', 'still', 'third', 'worst', 'frustrat', 'slow']

// Local fallback used when VITE_API_BASE_URL (the n8n instance) is not
// configured or the webhook is unreachable, so the UI never blocks.
function mockAnalysis(complaint: Pick<Complaint, 'description' | 'category'>): AIComplaintAnalysis {
  const text = complaint.description.toLowerCase()
  const negativeHits = sentimentKeywords.filter((k) => text.includes(k)).length
  const repeated = /third|again|repeated|multiple|still/.test(text)

  return {
    category: complaint.category,
    severity: repeated || negativeHits >= 3 ? 'High' : 'Medium',
    sentiment: negativeHits >= 1 ? 'Negative' : 'Neutral',
    repeatedIssue: repeated,
    frustration: repeated || negativeHits >= 2 ? 'High' : negativeHits === 1 ? 'Medium' : 'Low',
    recommendation: repeated
      ? 'Assign a senior technician and prioritize resolution to prevent escalation.'
      : 'Schedule an early follow-up visit and confirm the fix with the customer.',
  }
}

function unwrapAnalysis(data: AIComplaintAnalysis | { analysis: AIComplaintAnalysis } | unknown): AIComplaintAnalysis | null {
  if (!data || typeof data !== 'object') return null
  const candidate = data as { analysis?: unknown }
  if (candidate.analysis && typeof candidate.analysis === 'object') return candidate.analysis as AIComplaintAnalysis
  const shape = candidate as Partial<AIComplaintAnalysis>
  if (shape.severity && shape.sentiment) return shape as AIComplaintAnalysis
  return null
}

export async function analyzeComplaint(complaint: Pick<Complaint, 'description' | 'category'>): Promise<AIComplaintAnalysis> {
  const fallback = mockAnalysis(complaint)
  try {
    const data = await post<{ description: string; category: string }, unknown>(
      '/webhook/analyze-complaint',
      { description: complaint.description, category: complaint.category },
      fallback,
    )
    if (data instanceof Object && data === fallback) return await delay(fallback, 800)
    return unwrapAnalysis(data) ?? fallback
  } catch {
    return await delay(fallback, 800)
  }
}

export async function analyzeComplaintUnavailable(): Promise<never> {
  return delayError(1500)
}

export interface RetentionEmailContext {
  customer: Customer
  retentionAction: RetentionAction
  amcValue: number
  amcExpiry: string
}

const subjectByRisk: Record<string, string> = {
  'Service Quality': 'We want to make sure we get this right',
  Payment: 'Let us help you settle the outstanding amount',
  Price: 'A special offer for your continued partnership',
  Communication: 'A quick check-in before your renewal',
  'Low Risk': `Your ${''} renewal is coming up`,
}

function mockRenewalEmail(ctx: RetentionEmailContext): RenewalEmail {
  const { customer, retentionAction, amcValue, amcExpiry } = ctx
  const first = customer.name.split(' ')[0]
  const service = customer.serviceTypes[0] ?? 'AMC'
  const baseSubject = subjectByRisk[retentionAction.primaryRisk] ?? 'A quick note about your AMC renewal'
  const subject = retentionAction.primaryRisk === 'Low Risk'
    ? `Your ${service} AMC is up for renewal`
    : `${baseSubject} — ${first}, let's talk`

  const body = [
    `Dear ${customer.name},`,
    ``,
    `Your ${service} AMC with us is coming up for renewal on ${amcExpiry}. As your service partner, we want to keep things simple and dependable.`,
  ]

  switch (retentionAction.primaryRisk) {
    case 'Service Quality':
      body.push(
        '',
        `We know recent service visits were not up to the standard you expect from us. We have taken this seriously — a senior technician has been assigned, and we will follow up personally after the next visit to make sure everything is working as it should.`,
      )
      break
    case 'Payment':
      body.push(
        '',
        `We noticed an outstanding payment on your account. We would like to help you clear it comfortably — our team can set up a flexible payment plan that works for you.`,
      )
      break
    case 'Price':
      body.push(
        '',
        `As a valued customer, we would like to offer you a special renewal rate on your next contract term. Our team can walk you through the details over a quick call.`,
      )
      break
    case 'Communication':
      body.push(
        '',
        `We would love to check in with you and make sure the service you receive is exactly what you need. Your account manager will reach out this week.`,
      )
      break
    default:
      body.push(
        '',
        `To continue your coverage without interruption, simply confirm the renewal for the same value of ₹${amcValue.toLocaleString('en-IN')}.`,
      )
  }

  body.push(
    '',
    `We value having you with us and look forward to continuing to support your operations.`,
    ``,
    `Warm regards,`,
    `ServicePulse Service Team`,
  )

  return { subject, body: body.join('\n') }
}

export async function generateRenewalEmail(ctx: RetentionEmailContext): Promise<RenewalEmail> {
  const fallback = mockRenewalEmail(ctx)
  try {
    const data = await post<RetentionEmailContext, unknown>(
      '/webhook/generate-renewal-email',
      ctx,
      fallback,
    )
    if (data instanceof Object && data === fallback) return await delay(fallback, 900)
    if (data && typeof data === 'object') {
      const email = data as Partial<RenewalEmail>
      if (email.subject && email.body) return email as RenewalEmail
    }
    return fallback
  } catch {
    return await delay(fallback, 900)
  }
}