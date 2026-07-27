import nodemailer from 'nodemailer'
import { env, isMailConfigured } from '../../config/env.js'

/** @type {import('nodemailer').Transporter | null} */
let transporter = null

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: env.GMAIL_USER,
        pass: env.GMAIL_APP_PASSWORD,
      },
    })
  }
  return transporter
}

/**
 * Envoie un email via Gmail SMTP (Nodemailer).
 * Sans credentials valides (dev) : log le sujet + destinataire (+ debugPayload), pas d’erreur.
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
      console.info('[mail] Gmail SMTP not configured — email skipped (dev)')
      console.info('[mail]', { to, subject, from: env.MAIL_FROM, ...debugPayload })
    }
    return { skipped: true }
  }

  try {
    const info = await getTransporter().sendMail({
      from: env.MAIL_FROM,
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
        response: info.response,
      })
    }

    return info
  } catch (err) {
    console.error('[mail] Gmail SMTP send failed', {
      to,
      from: env.MAIL_FROM,
      code: err?.code,
      responseCode: err?.responseCode,
      response: err?.response,
      message: err?.message,
    })
    throw err
  }
}
