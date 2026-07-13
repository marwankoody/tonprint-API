import { z } from 'zod'
import { BLOG_CATEGORIES, BLOG_LOCALES } from './blog.model.js'

const coerceBool = z.preprocess((val) => {
  if (val === 'true' || val === true) return true
  if (val === 'false' || val === false) return false
  return val
}, z.boolean())

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, 'Invalid id')

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug format')

const localeContentSchema = z.object({
  title: z.string().trim().max(200).optional().default(''),
  excerpt: z.string().trim().max(500).optional().default(''),
  content: z.string().trim().max(20000).optional().default(''),
  metaTitle: z.string().trim().max(70).optional().default(''),
  metaDescription: z.string().trim().max(160).optional().default(''),
})

const localesSchema = z.object({
  fr: localeContentSchema.optional().default({}),
  en: localeContentSchema.optional().default({}),
  ar: localeContentSchema.optional().default({}),
})

export const listBlogQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  category: z
    .string()
    .refine((val) => BLOG_CATEGORIES.includes(val), { message: 'Invalid category' })
    .optional(),
  locale: z
    .string()
    .refine((val) => BLOG_LOCALES.includes(val), { message: 'Invalid locale' })
    .optional()
    .default('fr'),
})

export const adminListBlogQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(120).optional(),
  category: z
    .string()
    .refine((val) => BLOG_CATEGORIES.includes(val), { message: 'Invalid category' })
    .optional(),
  isPublished: coerceBool.optional(),
})

export const createBlogPostSchema = z.object({
  slug: slugSchema.optional(),
  category: z
    .string()
    .refine((val) => BLOG_CATEGORIES.includes(val), { message: 'Invalid category' }),
  isPublished: coerceBool.optional().default(false),
  locales: localesSchema.optional().default({}),
})

export const updateBlogPostSchema = createBlogPostSchema.partial().extend({
  removeCover: coerceBool.optional().default(false),
})

export const blogIdParamSchema = z.object({
  id: objectIdSchema,
})

export const blogSlugParamSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug'),
})

/**
 * Parse le corps multipart (JSON stringifié pour `locales`).
 * @param {import('express').Request['body']} body
 */
export function parseMultipartBlogBody(body) {
  const parsed = { ...body }

  if (typeof parsed.locales === 'string') {
    try {
      parsed.locales = JSON.parse(parsed.locales)
    } catch {
      throw new Error('Invalid locales JSON')
    }
  }

  return parsed
}
