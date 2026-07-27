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
  // SMTP — emails transactionnels (Gmail App Password recommandé).
  // Defaults: smtp.gmail.com:587 STARTTLS. Override for other providers.
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
 * True when SMTP credentials look usable.
 * @param {{ SMTP_USER?: string, SMTP_PASS?: string }} data
 */
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
    message: 'SMTP_USER and SMTP_PASS are required in production',
    path: ['SMTP_PASS'],
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
    // Compat: anciens noms GMAIL_* → SMTP_*
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

/** SMTP prêt si user + password sont valides. */
export const isMailConfigured = hasSmtpConfig(env)

if (
  env.NODE_ENV !== 'production' &&
  (env.SMTP_PASS || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD) &&
  !isMailConfigured
) {
  console.warn(
    '[mail] SMTP incomplete (need SMTP_USER + SMTP_PASS) — emails skipped; reset links logged in console'
  )
}
