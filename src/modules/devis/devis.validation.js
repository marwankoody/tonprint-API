import { z } from 'zod'
import {
  DEVIS_PRODUCTS,
  DEVIS_QUANTITIES,
  DEVIS_DEADLINES,
  DEVIS_STATUSES,
} from './devis.model.js'

/** Téléphone marocain : 0XXXXXXXXX, +212XXXXXXXXX, 00212… */
const moroccoPhoneRegex = /^(?:\+212|00212|0)[5-7]\d{8}$/

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, 'Invalid id')

export const createDevisSchema = z.object({
  company: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(180).transform((v) => v.toLowerCase()),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s.-]/g, ''))
    .refine((v) => moroccoPhoneRegex.test(v), {
      message: 'Invalid Moroccan phone number',
    }),
  products: z
    .array(
      z.string().refine((v) => DEVIS_PRODUCTS.includes(v), {
        message: 'Invalid product',
      })
    )
    .min(1)
    .max(10)
    .refine((arr) => new Set(arr).size === arr.length, {
      message: 'Duplicate products are not allowed',
    }),
  quantity: z.string().refine((v) => DEVIS_QUANTITIES.includes(v), {
    message: 'Invalid quantity',
  }),
  deadline: z
    .string()
    .optional()
    .nullable()
    .refine((v) => v == null || v === '' || DEVIS_DEADLINES.includes(v), {
      message: 'Invalid deadline',
    })
    .transform((v) => (v && DEVIS_DEADLINES.includes(v) ? v : null)),
  details: z.string().trim().min(10).max(3000),
  /**
   * Honeypot anti-bot — ne pas nommer "website" (autofill navigateurs).
   * Rempli → 204 silencieux dans le controller.
   */
  tp_hp: z.string().max(200).optional().default(''),
})

export const adminListDevisQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  status: z
    .string()
    .refine((v) => DEVIS_STATUSES.includes(v), { message: 'Invalid status' })
    .optional(),
  q: z.string().trim().max(100).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
})

export const listMyDevisQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  status: z
    .string()
    .refine((v) => DEVIS_STATUSES.includes(v), { message: 'Invalid status' })
    .optional(),
})

export const devisIdParamSchema = z.object({
  id: objectIdSchema,
})

export const updateDevisStatusSchema = z.object({
  status: z.string().refine((v) => DEVIS_STATUSES.includes(v), {
    message: 'Invalid status',
  }),
})
