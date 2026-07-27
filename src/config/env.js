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
  // URL canonique du site officiel (utilisée pour les liens emails, redirections, etc.)
  FRONTEND_URL: z.string().url().default('https://www.tonprint.ma'),
  // Domaine sur lequel poser le cookie de refresh token (ex: ".tonprint.ma" en prod
  // pour le partager entre www.tonprint.ma et tonprint.ma). Vide = domaine par défaut (dev).
  COOKIE_DOMAIN: z.string().optional().default(''),
  // Cloudinary — stockage images produits (requis pour POST/PUT avec upload)
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
  // Contact form → Google Sheets (Apps Script web app URL + shared secret)
  CONTACT_SHEETS_WEBHOOK_URL: z.string().optional().default(''),
  CONTACT_SHEETS_SECRET: z.string().optional().default(''),
  // Resend HTTPS API — required on Railway Hobby (outbound SMTP is blocked).
  RESEND_API_KEY: z.string().optional().default(''),
  // SMTP — local / Pro only (Gmail App Password). Railway Hobby cannot use this.
  SMTP_HOST: z.string().optional().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .string()
    .optional()
    .default('false')
    .transform((v) => ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase())),
  SMTP_USER: z.string().optional().default('tonprint.officiel@gmail.com'),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z
    .string()
    .optional()
    .default('TonPrint <tonprint.officiel@gmail.com>'),
})

/**
 * Mot de passe SMTP normalisé (App Password Gmail sans espaces).
 * @param {string} [password]
 */
function normalizeSmtpPass(password) {
  return String(password || '').replace(/\s+/g, '')
}

/**
 * @param {string} [key]
 */
function isValidResendApiKey(key) {
  const value = String(key || '').trim()
  if (!value) return false
  if (/^re_x+$/i.test(value)) return false
  if (/placeholder|changeme|your[_-]?key/i.test(value)) return false
  return /^re_[A-Za-z0-9]{20,}$/.test(value)
}

/**
 * @param {{ SMTP_USER?: string, SMTP_PASS?: string }} data
 */
function hasSmtpConfig(data) {
  const user = String(data?.SMTP_USER || '').trim()
  const pass = normalizeSmtpPass(data?.SMTP_PASS)
  return Boolean(user.includes('@') && pass.length >= 8)
}

/**
 * @param {{ RESEND_API_KEY?: string, SMTP_USER?: string, SMTP_PASS?: string }} data
 */
function hasAnyMailTransport(data) {
  return isValidResendApiKey(data?.RESEND_API_KEY) || hasSmtpConfig(data)
}

const parsed = envSchema
  .refine((data) => data.JWT_ACCESS_SECRET !== data.JWT_REFRESH_SECRET, {
    message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different',
    path: ['JWT_REFRESH_SECRET'],
  })
  .refine((data) => data.NODE_ENV !== 'production' || hasAnyMailTransport(data), {
    message:
      'Production requires RESEND_API_KEY (recommended on Railway) or SMTP_USER + SMTP_PASS',
    path: ['RESEND_API_KEY'],
  })
  .refine(
    (data) =>
      data.NODE_ENV !== 'production' ||
      !/localhost|127\.0\.0\.1/i.test(data.FRONTEND_URL),
    {
      message: 'FRONTEND_URL must be the public site URL in production (not localhost)',
      path: ['FRONTEND_URL'],
    }
  )
  .safeParse({
    ...process.env,
    SMTP_USER: process.env.SMTP_USER || process.env.GMAIL_USER,
    SMTP_PASS: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD,
    SMTP_FROM: process.env.SMTP_FROM || process.env.MAIL_FROM,
  })

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
}

/** Origines CORS autorisées (liste blanche). */
export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

/** Cloudinary est configuré si les 3 variables sont renseignées. */
export const isCloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
)

/** Contact → Google Sheets prêt si webhook + secret sont définis. */
export const isContactSheetsConfigured = Boolean(
  env.CONTACT_SHEETS_WEBHOOK_URL && env.CONTACT_SHEETS_SECRET
)

export const isResendConfigured = isValidResendApiKey(env.RESEND_API_KEY)
export const isSmtpConfigured = hasSmtpConfig(env)
/** Au moins un transport mail utilisable. */
export const isMailConfigured = isResendConfigured || isSmtpConfigured

if (env.NODE_ENV === 'production' && !isResendConfigured) {
  console.error(
    '[mail] FATAL for email delivery: RESEND_API_KEY missing. Railway Hobby blocks SMTP — password-reset emails will fail until RESEND_API_KEY is set. Use SMTP_FROM=TonPrint <beth.t@example.com> for tests (not @gmail.com).'
  )
} else if (env.NODE_ENV === 'production' && isResendConfigured) {
  console.info('[mail] transport: resend (HTTPS)')
}

if (
  env.NODE_ENV !== 'production' &&
  (env.SMTP_PASS || env.RESEND_API_KEY) &&
  !isMailConfigured
) {
  console.warn(
    '[mail] Mail incomplete — emails skipped; reset links logged in console'
  )
}
