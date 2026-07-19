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
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
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
})

const parsed = envSchema
  .refine((data) => data.JWT_ACCESS_SECRET !== data.JWT_REFRESH_SECRET, {
    message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different',
    path: ['JWT_REFRESH_SECRET'],
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
export const env = parsed.data

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
