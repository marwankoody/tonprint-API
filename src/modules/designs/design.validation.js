import { z } from 'zod'
import { PRINT_ZONES } from '../products/product.model.js'
import { corsOrigins, env } from '../../config/env.js'

/** Taille max du canvasJson sérialisé par zone (les images sont des URLs, jamais du base64). */
const MAX_CANVAS_JSON_BYTES = 200 * 1024
const MAX_OBJECTS_PER_ZONE = 100
const MAX_GROUP_DEPTH = 4

/** Types d'objets Fabric autorisés (comparaison insensible à la casse). */
const ALLOWED_FABRIC_TYPES = new Set([
  'text',
  'i-text',
  'itext',
  'textbox',
  'image',
  'rect',
  'circle',
  'ellipse',
  'triangle',
  'line',
  'polygon',
  'polyline',
  'path',
  'group',
])

/** Assets plateforme versionnés dans le frontend (`public/free-designs/`). */
const FREE_DESIGN_PATH_PREFIX = '/free-designs/'

function cloudinaryUrlPrefix() {
  const cloud = env.CLOUDINARY_CLOUD_NAME
  return cloud ? `https://res.cloudinary.com/${cloud}/` : 'https://res.cloudinary.com/'
}

/**
 * Image autorisée : URL Cloudinary (notre cloud) ou asset free-design
 * (chemin relatif, ou absolu dont l'origin ∈ CORS_ORIGINS).
 * Refuse data:, javascript: et domaines externes.
 * @param {string} src
 */
function isAllowedImageSrc(src) {
  if (!src) return false
  const cloudinaryPrefix = cloudinaryUrlPrefix()
  if (src.startsWith(cloudinaryPrefix)) return true
  if (src.startsWith(FREE_DESIGN_PATH_PREFIX)) return true
  // Fabric sérialise parfois l'URL absolue (ex. http://localhost:5173/free-designs/...)
  try {
    const url = new URL(src)
    if (!url.pathname.startsWith(FREE_DESIGN_PATH_PREFIX)) return false
    return corsOrigins.includes(url.origin)
  } catch {
    // pas une URL absolue
  }
  return false
}

/**
 * Valide récursivement les objets d'un canvas Fabric :
 * - types whitelistés uniquement
 * - `src` des images = Cloudinary ou `/free-designs/` (bloque data:, javascript:, domaines externes)
 * - profondeur de groupes bornée
 * @param {unknown[]} objects
 * @param {number} depth
 * @returns {string | null} message d'erreur ou null si valide
 */
function validateFabricObjects(objects, depth = 0) {
  if (depth > MAX_GROUP_DEPTH) return 'Group nesting too deep'
  if (!Array.isArray(objects)) return 'Canvas objects must be an array'
  if (objects.length > MAX_OBJECTS_PER_ZONE) {
    return `Too many objects (max ${MAX_OBJECTS_PER_ZONE})`
  }

  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') return 'Invalid canvas object'

    const type = String(obj.type || '').toLowerCase()
    if (!ALLOWED_FABRIC_TYPES.has(type)) {
      return `Object type "${obj.type}" is not allowed`
    }

    if (type === 'image') {
      const src = String(obj.src || '')
      if (!isAllowedImageSrc(src)) {
        return 'Image sources must be Cloudinary URLs or platform free-design assets'
      }
    }

    if (type === 'group' && obj.objects) {
      const nestedError = validateFabricObjects(obj.objects, depth + 1)
      if (nestedError) return nestedError
    }
  }

  return null
}

/**
 * Schéma d'un canvasJson Fabric sérialisé (`canvas.toJSON()`).
 * Refuse tout background/overlay image (le mockup n'est jamais persisté dans le JSON).
 */
const canvasJsonSchema = z
  .looseObject({
    version: z.string().max(20).optional(),
    objects: z.array(z.unknown()).default([]),
  })
  .superRefine((value, ctx) => {
    const serialized = JSON.stringify(value)
    if (Buffer.byteLength(serialized, 'utf8') > MAX_CANVAS_JSON_BYTES) {
      ctx.addIssue({
        code: 'custom',
        message: `Canvas JSON too large (max ${MAX_CANVAS_JSON_BYTES / 1024} KB). Images must be uploaded, not embedded.`,
      })
      return
    }

    if (value.backgroundImage || value.overlayImage) {
      ctx.addIssue({
        code: 'custom',
        message: 'Canvas JSON must not embed background or overlay images',
      })
      return
    }

    const error = validateFabricObjects(value.objects)
    if (error) {
      ctx.addIssue({ code: 'custom', message: error })
    }
  })

const designVariantSchema = z.object({
  colorName: z.string().trim().max(60).optional().default(''),
  colorHex: z
    .string()
    .trim()
    .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)
    .or(z.literal(''))
    .optional()
    .default(''),
  size: z.string().trim().max(30).optional().default(''),
  quality: z.string().trim().max(20).optional().default(''),
  printType: z.string().trim().max(60).optional().default(''),
})

const designZoneSchema = z.object({
  zone: z.enum(PRINT_ZONES),
  canvasJson: canvasJsonSchema,
})

const designZonesSchema = z
  .array(designZoneSchema)
  .min(1)
  .max(5)
  .refine((zones) => new Set(zones.map((z) => z.zone)).size === zones.length, {
    message: 'Duplicate zones are not allowed',
  })

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, 'Invalid id')

export const createDesignSchema = z.object({
  product: objectIdSchema,
  title: z.string().trim().min(1).max(120),
  variant: designVariantSchema.optional().default({}),
  zones: designZonesSchema,
})

/** Update partiel — pas de `.default()` ici pour ne jamais écraser un champ non envoyé. */
export const updateDesignSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  variant: designVariantSchema.optional(),
  zones: designZonesSchema.optional(),
})

export const listDesignsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
})

export const designIdParamSchema = z.object({
  id: objectIdSchema,
})

export const zoneAssetsBodySchema = z.object({
  zone: z.enum(PRINT_ZONES),
})

export const listAdminDesignsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  status: z.enum(['draft', 'pending_review', 'approved', 'rejected', 'all']).optional(),
})

export const rejectDesignSchema = z.object({
  reason: z.string().trim().min(3).max(500),
})
