import { Resend } from 'resend'
import nodemailer from 'nodemailer'
import { env, isMailConfigured, isResendConfigured } from '../../config/env.js'

/** @type {Resend | null} */
let resendClient = null

/** @type {import('nodemailer').Transporter | null} */
let smtpTransporter = null

function getResend() {
  if (!resendClient) {
    resendClient = new Resend(env.RESEND_API_KEY)
  }
  return resendClient
}

function getSmtpTransporter() {
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
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
  return smtpTransporter
}

/**
 * Envoie un email : Resend (HTTPS) en priorité, sinon SMTP local.
 * Sans credentials : skip (en dev, log sujet + destinataire).
 *
 * @param {{ to: string, subject: string, html: string, text: string }} opts
 */
export async function sendMail({ to, subject, html, text }) {
  if (!isMailConfigured) {
    if (env.NODE_ENV !== 'production') {
      console.info('[mail] not configured — email skipped', {
        to,
        subject,
        from: env.MAIL_FROM || env.SMTP_FROM,
      })
    }
    return { skipped: true }
  }

  try {
    if (isResendConfigured) {
      const { data, error } = await getResend().emails.send({
        from: env.MAIL_FROM,
        to: [to],
        subject,
        html,
        text,
      })

      if (error) {
        throw new Error(error.message || 'Resend send failed')
      }

      if (env.NODE_ENV !== 'production') {
        console.info('[mail] sent via Resend', { to, subject, id: data?.id })
      }

      return data
    }

    const info = await getSmtpTransporter().sendMail({
      from: env.SMTP_FROM || env.MAIL_FROM,
      to,
      subject,
      html,
      text,
    })

    if (env.NODE_ENV !== 'production') {
      console.info('[mail] sent via SMTP', {
        to,
        subject,
        messageId: info.messageId,
      })
    }

    return info
  } catch (err) {
    console.error('[mail] send failed:', err?.message || err)
    throw err
  }
}
