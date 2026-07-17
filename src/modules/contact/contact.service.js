import { env, isContactSheetsConfigured } from '../../config/env.js'
import { AppError } from '../../utils/AppError.js'

const DEFAULT_STATUS = 'Pending'

/**
 * Envoie le message contact vers Google Sheets via Apps Script webhook.
 * Le statut initial « Pending » est posé côté script (colonne avec liste déroulante).
 *
 * Note : Content-Type `text/plain` (pas application/json) — Apps Script redirige le POST
 * et Node perd sinon le body → Unauthorized.
 *
 * @param {{
 *   name: string,
 *   email: string,
 *   phone?: string,
 *   subject: string,
 *   message: string,
 *   locale?: string,
 *   tp_hp?: string,
 * }} payload
 * @param {{ ip?: string }} [meta]
 */
export async function submitContactMessage(payload, meta = {}) {
  // Honeypot : on simule un succès sans écrire (ne pas tipper les bots).
  if (payload.tp_hp) {
    return { ok: true }
  }

  if (!isContactSheetsConfigured) {
    throw new AppError(
      'Contact form is not configured (Google Sheets webhook missing)',
      503,
      'CONTACT_NOT_CONFIGURED'
    )
  }

  const body = {
    secret: env.CONTACT_SHEETS_SECRET,
    timestamp: new Date().toISOString(),
    name: payload.name,
    email: payload.email,
    phone: payload.phone || '',
    subject: payload.subject,
    message: payload.message,
    locale: payload.locale || 'fr',
    status: DEFAULT_STATUS,
    source: 'tonprint-web',
    ip: meta.ip || '',
  }

  let response
  try {
    response = await fetch(env.CONTACT_SHEETS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    console.error('[contact] sheets webhook network error:', err?.message || err)
    throw new AppError('Unable to deliver contact message', 502, 'CONTACT_DELIVERY_FAILED')
  }

  const rawText = await response.text().catch(() => '')

  if (!response.ok) {
    console.error('[contact] sheets webhook HTTP', response.status, rawText.slice(0, 300))
    throw new AppError('Unable to deliver contact message', 502, 'CONTACT_DELIVERY_FAILED')
  }

  let data = null
  try {
    data = rawText ? JSON.parse(rawText) : null
  } catch {
    // corps non-JSON → OK si HTTP 200 (rare)
  }

  if (data?.ok === false) {
    const detail = data.message || 'Unable to deliver contact message'
    console.error('[contact] sheets webhook rejected:', detail, data.hint || '')
    throw new AppError(
      detail === 'Unauthorized' || detail === 'Missing secret'
        ? 'Google Sheets rejected the request (SCRIPT_SECRET must equal CONTACT_SHEETS_SECRET, then redeploy Apps Script)'
        : detail,
      502,
      'CONTACT_DELIVERY_FAILED'
    )
  }

  return { ok: true }
}
