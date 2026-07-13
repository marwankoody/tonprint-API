import { z } from 'zod'
import { PRODUCT_CATEGORIES } from './product.model.js'

const coerceBool = z.preprocess((val) => {
  if (val === 'true' || val === true) return true
  if (val === 'false' || val === false) return false
  return val
}, z.boolean())

const measurementsSchema = z
  .object({
    chest: z.coerce.number().min(0).optional(),
    length: z.coerce.number().min(0).optional(),
    sleeve: z.coerce.number().min(0).optional(),
  })
  .optional()

const variantSchema = z.object({
  label: z.string().trim().min(1, 'Variant label is required'),
  sku: z.string().trim().optional(),
  priceDelta: z.coerce.number().default(0),
  stock: z.coerce.number().int().min(0).default(0),
  measurements: measurementsSchema,
})

const colorSchema = z.object({
  name: z.string().trim().min(1),
  hex: z
    .string()
    .trim()
    .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, 'Invalid color hex'),
})

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  category: z
    .string()
    .refine((val) => PRODUCT_CATEGORIES.includes(val), { message: 'Invalid category' })
    .optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z.enum(['price_asc', 'price_desc', 'popularity', 'newest']).optional().default('newest'),
})

/** Query pour `GET /api/products/admin` — gestion catalogue (inclut les brouillons). */
export const adminListProductsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(120).optional(),
  category: z
    .string()
    .refine((val) => PRODUCT_CATEGORIES.includes(val), { message: 'Invalid category' })
    .optional(),
  isPublished: coerceBool.optional(),
})

export const createProductSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  category: z
    .string()
    .refine((val) => PRODUCT_CATEGORIES.includes(val), { message: 'Invalid category' }),
  description: z.string().trim().max(20000).optional().default(''),
  printType: z.string().trim().max(60).optional().default(''),
  price: z.coerce.number().min(0, 'Price must be >= 0'),
  compareAtPrice: z.coerce.number().min(0).nullable().optional().default(null),
  wholesalePrice: z.coerce.number().min(0).nullable().optional().default(null),
  wholesaleMoq: z.coerce.number().int().min(1).optional().default(30),
  stock: z.coerce.number().int().min(0).default(0),
  isPublished: coerceBool.optional().default(false),
  isPointsRedeemable: coerceBool.optional().default(false),
  pointsCost: z.coerce.number().int().min(0).default(0),
  variants: z.array(variantSchema).optional().default([]),
  colors: z.array(colorSchema).optional().default([]),
})

export const updateProductSchema = createProductSchema.partial().extend({
  removeImagePublicIds: z.array(z.string().min(1)).optional(),
})

/**
 * Parse le corps d'une requête multipart (champs texte + JSON `variants` / `colors`).
 * @param {import('express').Request['body']} body
 */
export function parseMultipartProductBody(body) {
  const parsed = { ...body }

  for (const key of ['variants', 'colors', 'removeImagePublicIds']) {
    if (typeof parsed[key] === 'string' && parsed[key].trim()) {
      try {
        parsed[key] = JSON.parse(parsed[key])
      } catch {
        throw new Error(`Invalid JSON in ${key} field`)
      }
    }
  }

  return parsed
}
