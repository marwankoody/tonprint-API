import { z } from 'zod'
import { PRODUCT_CATEGORIES, PRODUCT_CHANNELS, PRINT_ZONES } from './product.model.js'

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

/** URLs mockup restreintes à Cloudinary (fichiers uploadés via notre API uniquement). */
const cloudinaryUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v.startsWith('https://res.cloudinary.com/'), {
    message: 'Mockup URL must be a Cloudinary URL',
  })

const printAreaMockupSchema = z.object({
  colorName: z.string().trim().min(1).max(60),
  url: cloudinaryUrlSchema,
  publicId: z.string().trim().min(1).max(200),
})

const printAreaSchema = z.object({
  zone: z.enum(PRINT_ZONES),
  mockups: z.array(printAreaMockupSchema).max(20).default([]),
  rectPx: z.object({
    x: z.coerce.number().min(0),
    y: z.coerce.number().min(0),
    w: z.coerce.number().min(1),
    h: z.coerce.number().min(1),
  }),
  sizeCm: z.object({
    w: z.coerce.number().min(0.1).max(500),
    h: z.coerce.number().min(0.1).max(500),
  }),
})

const printAreasSchema = z
  .array(printAreaSchema)
  .max(PRINT_ZONES.length)
  .refine((areas) => new Set(areas.map((a) => a.zone)).size === areas.length, {
    message: 'Duplicate print zones are not allowed',
  })

const channelSchema = z
  .string()
  .refine((val) => PRODUCT_CHANNELS.includes(val), { message: 'Invalid channel' })

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  category: z
    .string()
    .refine((val) => PRODUCT_CATEGORIES.includes(val), { message: 'Invalid category' })
    .optional(),
  channel: channelSchema.optional().default('marketplace'),
  search: z.string().trim().max(120).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z.enum(['price_asc', 'price_desc', 'popularity', 'newest']).optional().default('newest'),
  redeemable: coerceBool.optional(),
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
  channel: channelSchema.optional(),
  isPublished: coerceBool.optional(),
})

export const createProductSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  category: z
    .string()
    .refine((val) => PRODUCT_CATEGORIES.includes(val), { message: 'Invalid category' }),
  channel: channelSchema.default('marketplace'),
  description: z.string().trim().max(20000).optional().default(''),
  printType: z.string().trim().max(60).optional().default(''),
  printTypes: z.array(z.string().trim().min(1).max(60)).max(10).optional().default([]),
  price: z.coerce.number().min(0, 'Price must be >= 0'),
  compareAtPrice: z.coerce.number().min(0).nullable().optional().default(null),
  wholesalePrice: z.coerce.number().min(0).nullable().optional().default(null),
  wholesaleMoq: z.coerce.number().int().min(1).optional().default(30),
  stock: z.coerce.number().int().min(0).default(0),
  isPublished: coerceBool.optional().default(false),
  isPointsRedeemable: coerceBool.optional().default(false),
  pointsCost: z.coerce.number().int().min(0).default(0),
  /** Design créateur lié (marketplace) — ObjectId ou chaîne vide pour détacher. */
  sourceDesign: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{24}$/, 'Invalid sourceDesign id')
    .or(z.literal(''))
    .optional()
    .nullable(),
  variants: z.array(variantSchema).optional().default([]),
  colors: z.array(colorSchema).optional().default([]),
  printAreas: printAreasSchema.optional().default([]),
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

  for (const key of ['variants', 'colors', 'removeImagePublicIds', 'printAreas', 'printTypes']) {
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
