import { z } from 'zod'

const CONTACT_SUBJECTS = Object.freeze([
  'general',
  'order_support',
  'creators',
  'partnership',
  'other',
])

export const createContactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(180),
  phone: z.string().trim().max(20).optional().default(''),
  subject: z.enum(CONTACT_SUBJECTS),
  message: z.string().trim().min(10).max(3000),
  locale: z.enum(['fr', 'en', 'ar']).optional().default('fr'),
  /**
   * Honeypot anti-bot — ne pas nommer "website" (autofill navigateurs).
   * Rempli → succès silencieux dans le service (pas d’écriture Sheets).
   */
  tp_hp: z.string().max(200).optional().default(''),
})
