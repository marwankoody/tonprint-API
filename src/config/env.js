import { z } from 'zod'

/**
 * Valide les variables d'environnement au démarrage (fail-fast).
 * Quitte le process si une variable requise manque ou est invalide.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('1d'),
  CORS_ORIGINS: z.string().min(1, 'CORS_ORIGINS is required'),
  COOKIE_DOMAIN: z.string().optional().default(''),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
  CONTACT_SHEETS_WEBHOOK_URL: z.string().optional().default(''),
  CONTACT_SHEETS_SECRET: z.string().optional().default(''),
  // Resend (HTTPS) — obligatoire en production (Railway Hobby bloque SMTP)
  RESEND_API_KEY: z.string().optional().default(''),
  MAIL_FROM: z.string().optional().default('TonPrint <onboarding@resend.dev>'),
  // SMTP optionnel — fallback local uniquement (Gmail App Password)
  SMTP_HOST: z.string().optional().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .string()
    .optional()
    .default('false')
    .transform((v) => ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase())),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default(''),
})

function normalizeSmtpPass(password) {
  return String(password || '').replace(/\s+/g, '')
}

function hasResendConfig(data) {
  return String(data?.RESEND_API_KEY || '').trim().length >= 20
}

function hasSmtpConfig(data) {
  const user = String(data?.SMTP_USER || '').trim()
  const pass = normalizeSmtpPass(data?.SMTP_PASS)
  return Boolean(user.includes('@') && pass.length >= 8)
}

const parsed = envSchema
  .refine((data) => data.JWT_ACCESS_SECRET !== data.JWT_REFRESH_SECRET, {
    message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different',
    path: ['JWT_REFRESH_SECRET'],
  })
  .refine((data) => data.NODE_ENV !== 'production' || hasResendConfig(data), {
    message: 'RESEND_API_KEY is required in production (HTTPS email; SMTP blocked on Railway Hobby)',
    path: ['RESEND_API_KEY'],
  })
  .safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

/** @type {z.infer<typeof envSchema>} */
export const env = {
  ...parsed.data,
  RESEND_API_KEY: String(parsed.data.RESEND_API_KEY || '').trim(),
  MAIL_FROM: String(parsed.data.MAIL_FROM || '').trim() || 'TonPrint <onboarding@resend.dev>',
  SMTP_PASS: normalizeSmtpPass(parsed.data.SMTP_PASS),
  SMTP_FROM:
    String(parsed.data.SMTP_FROM || '').trim() ||
    (parsed.data.SMTP_USER
      ? `TonPrint <${String(parsed.data.SMTP_USER).trim()}>`
      : ''),
}

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

export const isCloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
)

export const isContactSheetsConfigured = Boolean(
  env.CONTACT_SHEETS_WEBHOOK_URL && env.CONTACT_SHEETS_SECRET
)

export const isResendConfigured = hasResendConfig(env)
export const isSmtpConfigured = hasSmtpConfig(env)

/** Au moins un transport email prêt (Resend prioritaire, SMTP en fallback local). */
export const isMailConfigured = isResendConfigured || isSmtpConfigured
