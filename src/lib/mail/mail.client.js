import dns from 'dns'
import nodemailer from 'nodemailer'
import {
  env,
  isMailConfigured,
  isResendConfigured,
  isSmtpConfigured,
} from '../../config/env.js'

// Prefer IPv4 for SMTP (avoids ENETUNREACH on hosts without routable IPv6).
try {
  dns.setDefaultResultOrder('ipv4first')
} catch {
  /* Node < 17 */
}

/** @type {import('nodemailer').Transporter | null} */
let transporter = null

function getSmtpTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      family: 4,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    })
  }
  return transporter
}

/**
 * Envoi via Resend HTTPS (fonctionne sur Railway Hobby — SMTP y est bloqué).
 */
async function sendViaResend({ to, subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.SMTP_FROM,
      to: [to],
      subject,
      html,
      text,
    }),
  })

  const body = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(`Resend error ${res.status}: ${body.slice(0, 300)}`)
  }

  let data = { ok: true }
  try {
    data = JSON.parse(body)
  } catch {
    /* ignore */
  }
  return data
}

/**
 * Envoie un email : Resend (HTTPS) en priorité, sinon SMTP.
 *
 * @param {{
 *   to: string,
 *   subject: string,
 *   html: string,
 *   text: string,
 *   debugPayload?: Record<string, unknown>,
 * }} opts
 */
export async function sendMail({ to, subject, html, text, debugPayload }) {
  if (!isMailConfigured) {
    console.info('[mail] not configured — email skipped', {
      to,
      subject,
      ...debugPayload,
    })
    return { skipped: true }
  }

  const transport = isResendConfigured ? 'resend' : 'smtp'

  try {
    if (isResendConfigured) {
      const data = await sendViaResend({ to, subject, html, text })
      console.info('[mail] sent', {
        transport,
        to,
        subject,
        id: data?.id || null,
      })
      return data
    }

    const info = await getSmtpTransporter().sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      html,
      text,
    })

    console.info('[mail] sent', {
      transport,
      to,
      subject,
      messageId: info.messageId,
      response: info.response,
    })
    return info
  } catch (err) {
    console.error('[mail] send failed', {
      transport,
      to,
      from: env.SMTP_FROM,
      host: isResendConfigured ? 'api.resend.com' : env.SMTP_HOST,
      port: isResendConfigured ? 443 : env.SMTP_PORT,
      smtpConfigured: isSmtpConfigured,
      resendConfigured: isResendConfigured,
      code: err?.code,
      responseCode: err?.responseCode,
      message: err?.message,
    })
    throw err
  }
}
