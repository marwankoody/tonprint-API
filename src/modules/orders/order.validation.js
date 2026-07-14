import { z } from 'zod'
import { ORDER_STATUSES, ORDER_CHANNELS } from './order.model.js'

/** Téléphone marocain : 0XXXXXXXXX, +212XXXXXXXXX, 00212… */
const moroccoPhoneRegex = /^(?:\+212|00212|0)[5-7]\d{8}$/

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, 'Invalid id')

const orderItemInputSchema = z.object({
  productId: objectIdSchema,
  quantity: z.coerce.number().int().min(1).max(999),
  variantId: objectIdSchema.optional(),
  color: z.string().trim().max(60).optional(),
  designId: objectIdSchema.optional(),
})

const deliveryAddressSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s.-]/g, ''))
    .refine((v) => moroccoPhoneRegex.test(v), {
      message: 'Invalid Moroccan phone number',
    }),
  city: z.string().trim().min(2).max(80),
  address: z.string().trim().min(5).max(250),
  postalCode: z.string().trim().max(20).optional().default(''),
  notes: z.string().trim().max(500).optional().default(''),
})

export const createOrderSchema = z.object({
  items: z.array(orderItemInputSchema).min(1).max(30),
  deliveryAddress: deliveryAddressSchema,
})

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  status: z
    .string()
    .refine((val) => ORDER_STATUSES.includes(val), { message: 'Invalid status' })
    .optional(),
  channel: z
    .string()
    .refine((val) => ORDER_CHANNELS.includes(val), { message: 'Invalid channel' })
    .optional(),
})

/** Liste admin — toutes les commandes + filtres. */
export const adminListOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  status: z
    .string()
    .refine((val) => ORDER_STATUSES.includes(val), { message: 'Invalid status' })
    .optional(),
  channel: z
    .string()
    .refine((val) => ORDER_CHANNELS.includes(val), { message: 'Invalid channel' })
    .optional(),
  q: z.string().trim().max(100).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
})

export const updateOrderStatusSchema = z.object({
  status: z
    .string()
    .refine((val) => ORDER_STATUSES.includes(val), { message: 'Invalid status' }),
})

export const orderIdParamSchema = z.object({
  id: objectIdSchema,
})
