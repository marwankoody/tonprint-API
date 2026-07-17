import { z } from 'zod'

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, 'Invalid id')

const deliveryAddressSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(8).max(20),
  city: z.string().trim().min(2).max(80),
  address: z.string().trim().min(5).max(250),
  postalCode: z.string().trim().max(20).optional().default(''),
  notes: z.string().trim().max(500).optional().default(''),
})

export const listHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
})

export const redeemSchema = z.object({
  productId: objectIdSchema,
  quantity: z.coerce.number().int().min(1).max(20).optional().default(1),
  variantId: objectIdSchema.optional(),
  deliveryAddress: deliveryAddressSchema,
})

export const adminAdjustPointsSchema = z.object({
  amount: z.coerce.number().int().min(1).max(1_000_000),
  type: z.enum(['credit', 'debit']),
  reason: z.string().trim().min(3).max(200),
})

export const userIdParamSchema = z.object({
  id: objectIdSchema,
})
