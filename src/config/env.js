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
  // Gmail SMTP (App Password) — obligatoire en production
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
  .refine((data) => data.NODE_ENV !== 'production' || hasSmtpConfig(data), {
    message: 'SMTP_USER and SMTP_PASS are required in production (password reset emails)',
    path: ['SMTP_PASS'],
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

/** Gmail SMTP prêt. */
export const isMailConfigured = hasSmtpConfig(env)
