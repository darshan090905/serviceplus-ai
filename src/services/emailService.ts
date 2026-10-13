/**
 * emailService.ts
 * Sends real transactional emails via the n8n webhook at VITE_API_BASE_URL.
 * Falls back silently when the env var is not set (local dev without n8n).
 *
 * n8n webhook expected path: POST /webhook/send-email
 * Expected payload: { to, toEmail, subject, body, type }
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export interface EmailPayload {
  to: string
  toEmail: string
  subject: string
  body: string
  type: 'payment_request' | 'payment_success' | 'reminder' | 'general'
}

/**
 * Fires a real email via n8n. If VITE_API_BASE_URL is not set, this is a
 * no-op so local development without n8n continues to work.
 */
export async function sendRealEmail(payload: EmailPayload): Promise<void> {
  if (!API_BASE) return

  try {
    await fetch(`${API_BASE}/webhook/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // Network errors swallowed — real email is best-effort
  }
}
