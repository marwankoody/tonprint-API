import nodemailer from 'nodemailer'
import { env, isMailConfigured } from '../../config/env.js'

/** @type {import('nodemailer').Transporter | null} */
let transporter = null

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      family: 4,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    })
  }
  return transporter
}

/**
 * Envoie un email via Gmail SMTP (Nodemailer).
 * Sans credentials : skip (en dev, log sujet + destinataire + debugPayload optionnel).
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
    if (env.NODE_ENV !== 'production') {
      console.info('[mail] SMTP not configured — email skipped')
      console.info('[mail]', { to, subject, from: env.SMTP_FROM, ...debugPayload })
    }
    return { skipped: true }
  }

  try {
    const info = await getTransporter().sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      html,
      text,
    })

    if (env.NODE_ENV !== 'production') {
      console.info('[mail] sent', {
        to,
        subject,
        messageId: info.messageId,
      })
    }

    return info
  } catch (err) {
    console.error('[mail] SMTP send failed:', err?.message || err)
    throw err
  }
}
