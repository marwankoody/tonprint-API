import { z } from 'zod'
import { PRODUCT_QUALITY_KEYS } from '../products/product.model.js'
import { normalizeMoroccoPhone, MOROCCO_PHONE_REGEX } from '../../utils/moroccoPhone.js'

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, 'Invalid id')

// Même normalisation téléphone que les commandes (cohérence redeem / checkout).
const deliveryAddressSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .trim()
    .transform((v) => normalizeMoroccoPhone(v))
    .refine((v) => MOROCCO_PHONE_REGEX.test(v), {
      message: 'Invalid Moroccan phone number',
    }),
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
  quality: z.enum(PRODUCT_QUALITY_KEYS).optional(),
  deliveryAddress: deliveryAddressSchema,
})

export const adminAdjustPointsSchema = z.object({
  amount: z.coerce.number().int().min(1).max(1_000_000),
  type: z.enum(['credit', 'debit']),
  reason: z.string().trim().min(3).max(200),
})

export const adminPointsSettingsSchema = z.object({
  milestoneSize: z.coerce.number().int().min(1).max(10_000),
  pointsPerMilestone: z.coerce.number().int().min(1).max(1_000_000),
})

export const userIdParamSchema = z.object({
  id: objectIdSchema,
})
