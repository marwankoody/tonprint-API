import { z } from 'zod'
import { env } from '../../config/env.js'
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CHANNELS,
  PRINT_ZONES,
  PRODUCT_QUALITY_KEYS,
  ALL_SUBCATEGORIES,
  isValidCategoryPair,
} from './product.model.js'

const coerceBool = z.preprocess((val) => {
  if (val === 'true' || val === true) return true
  if (val === 'false' || val === false) return false
  return val
}, z.boolean())

const categorySchema = z
  .string()
  .refine((val) => PRODUCT_CATEGORIES.includes(val), { message: 'Invalid category' })

const subcategorySchema = z
  .string()
  .refine((val) => ALL_SUBCATEGORIES.includes(val), { message: 'Invalid subcategory' })

/** Couple parent + enfant valide. */
const categoryPairRefine = (data, ctx) => {
  if (data.category == null || data.subcategory == null) return
  if (!isValidCategoryPair(data.category, data.subcategory)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Subcategory does not belong to category',
      path: ['subcategory'],
    })
  }
}

/** List query : subcategory seulement si category est présente + couple valide. */
const listCategoryRefine = (data, ctx) => {
  if (data.subcategory && !data.category) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'category is required when subcategory is set',
      path: ['subcategory'],
    })
    return
  }
  if (data.category && data.subcategory && !isValidCategoryPair(data.category, data.subcategory)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Subcategory does not belong to category',
      path: ['subcategory'],
    })
  }
}

const measurementsSchema = z
  .object({
    chest: z.coerce.number().min(0).optional(),
    length: z.coerce.number().min(0).optional(),
    sleeve: z.coerce.number().min(0).optional(),
  })
  .optional()

const variantSchema = z.object({
  label: z.string().trim().min(1, 'Variant label is required').max(80),
  sku: z.string().trim().max(80).optional(),
  priceDelta: z.coerce.number().default(0),
  stock: z.coerce.number().int().min(0).default(0),
  measurements: measurementsSchema,
})

const colorSchema = z.object({
  name: z.string().trim().min(1).max(80),
  hex: z
    .string()
    .trim()
    .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, 'Invalid color hex'),
})

const qualitySchema = z.object({
  key: z.enum(PRODUCT_QUALITY_KEYS),
  price: z.coerce.number().min(0, 'Quality price must be >= 0'),
})

const qualitiesSchema = z
  .array(qualitySchema)
  .max(PRODUCT_QUALITY_KEYS.length)
  .refine((items) => new Set(items.map((q) => q.key)).size === items.length, {
    message: 'Duplicate quality keys are not allowed',
  })
  .optional()
  .default([])

/** URLs mockup restreintes à notre cloud Cloudinary. */
const cloudinaryUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => {
      const cloud = env.CLOUDINARY_CLOUD_NAME
      if (!cloud) return v.startsWith('https://res.cloudinary.com/')
      return v.startsWith(`https://res.cloudinary.com/${cloud}/`)
    },
    {
      message: 'Mockup URL must be a Cloudinary URL for this project',
    }
  )

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

/** Params `/:id` — cohérence avec les autres modules (blog, devis…). */
export const productIdParamSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{24}$/, 'Invalid product id'),
})

export const listProductsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    category: categorySchema.optional(),
    subcategory: subcategorySchema.optional(),
    channel: channelSchema.optional().default('marketplace'),
    search: z.string().trim().max(120).optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    sort: z.enum(['price_asc', 'price_desc', 'popularity', 'newest']).optional().default('newest'),
    redeemable: coerceBool.optional(),
  })
  .superRefine(listCategoryRefine)

/** Query pour `GET /api/products/admin` — gestion catalogue (inclut les brouillons). */
export const adminListProductsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    search: z.string().trim().max(120).optional(),
    category: categorySchema.optional(),
    subcategory: subcategorySchema.optional(),
    channel: channelSchema.optional(),
    isPublished: coerceBool.optional(),
  })
  .superRefine(listCategoryRefine)

const productBodyObjectSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  category: categorySchema,
  subcategory: subcategorySchema,
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
  qualities: qualitiesSchema,
  printAreas: printAreasSchema.optional().default([]),
})

export const createProductSchema = productBodyObjectSchema.superRefine(categoryPairRefine)

// Zod v4 : `.partial()` interdit sur un schéma déjà affiné — partir de l'objet brut.
export const updateProductSchema = productBodyObjectSchema
  .partial()
  .extend({
    removeImagePublicIds: z.array(z.string().min(1)).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.category !== undefined || data.subcategory !== undefined) {
      if (data.category === undefined || data.subcategory === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'category and subcategory must be sent together',
          path: ['subcategory'],
        })
        return
      }
      categoryPairRefine(data, ctx)
    }
  })

/**
 * Parse le corps d'une requête multipart (champs texte + JSON `variants` / `colors`).
 * @param {import('express').Request['body']} body
 */
export function parseMultipartProductBody(body) {
  const parsed = { ...body }

  for (const key of [
    'variants',
    'colors',
    'qualities',
    'removeImagePublicIds',
    'printAreas',
    'printTypes',
  ]) {
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
