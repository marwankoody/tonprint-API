import mongoose from 'mongoose'
import { BlogPost, BLOG_LOCALES } from './blog.model.js'
import { AppError } from '../../utils/AppError.js'
import { parsePagination, paginationMeta } from '../../utils/pagination.js'
import { deleteCloudinaryImages } from '../../lib/cloudinaryUpload.js'
import {
  sanitizeBlogHtml,
  estimateReadingTimeMinutes,
  slugify,
} from './blog.utils.js'
import { escapeRegex } from '../../utils/escapeRegex.js'

/**
 * @param {object} raw
 */
function normalizeLocale(raw = {}) {
  return {
    title: String(raw.title || '').trim(),
    excerpt: String(raw.excerpt || '').trim(),
    content: sanitizeBlogHtml(raw.content || ''),
    metaTitle: String(raw.metaTitle || '').trim(),
    metaDescription: String(raw.metaDescription || '').trim(),
  }
}

/**
 * @param {object} locales
 */
function normalizeLocales(locales = {}) {
  const result = {}
  for (const locale of BLOG_LOCALES) {
    result[locale] = normalizeLocale(locales[locale])
  }
  return result
}

/**
 * Compat : anciens posts à champs plats → locales.fr
 * @param {object} post
 */
function extractLocales(post) {
  if (post.locales && (post.locales.fr || post.locales.en || post.locales.ar)) {
    return {
      fr: normalizeLocale(post.locales.fr),
      en: normalizeLocale(post.locales.en),
      ar: normalizeLocale(post.locales.ar),
    }
  }

  if (post.title || post.content || post.excerpt) {
    return normalizeLocales({
      fr: {
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        metaTitle: post.metaTitle,
        metaDescription: post.metaDescription,
      },
    })
  }

  return normalizeLocales({})
}

/**
 * Résout une locale demandée avec fallback FR. Ne renvoie qu'une locale (perf).
 * @param {object} locales
 * @param {string} preferred
 */
function resolveLocaleContent(locales, preferred = 'fr') {
  const lang = BLOG_LOCALES.includes(preferred) ? preferred : 'fr'
  const primary = locales?.[lang]
  const fallback = locales?.fr
  const used = primary?.title || primary?.content ? lang : 'fr'

  const pick = (field) => {
    const value = primary?.[field]
    if (value) return value
    return fallback?.[field] || ''
  }

  return {
    locale: used,
    title: pick('title'),
    excerpt: pick('excerpt'),
    content: pick('content'),
    metaTitle: pick('metaTitle') || pick('title'),
    metaDescription: pick('metaDescription') || pick('excerpt'),
  }
}

/**
 * @param {object} post
 */
function formatBlogAdmin(post) {
  return {
    id: post._id.toString(),
    slug: post.slug,
    category: post.category,
    coverImage: post.coverImage
      ? { url: post.coverImage.url, publicId: post.coverImage.publicId }
      : null,
    author: post.author?.toString?.() ?? post.author,
    isPublished: post.isPublished,
    publishedAt: post.publishedAt,
    readingTimeMinutes: post.readingTimeMinutes,
    locales: extractLocales(post),
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  }
}

/**
 * Format public — une seule locale résolue (pas les 3 HTML).
 * @param {object} post
 * @param {string} locale
 * @param {{ includeContent?: boolean }} [options]
 */
function formatBlogPublic(post, locale, options = {}) {
  const locales = extractLocales(post)
  const resolved = resolveLocaleContent(locales, locale)

  const base = {
    id: post._id.toString(),
    slug: post.slug,
    category: post.category,
    coverImage: post.coverImage?.url || null,
    publishedAt: post.publishedAt,
    readingTimeMinutes: post.readingTimeMinutes,
    locale: resolved.locale,
    title: resolved.title,
    excerpt: resolved.excerpt,
    metaTitle: resolved.metaTitle,
    metaDescription: resolved.metaDescription,
  }

  if (options.includeContent) {
    base.content = resolved.content
  }

  return base
}

/**
 * @param {string} baseSlug
 * @param {string} [excludeId]
 */
async function ensureUniqueSlug(baseSlug, excludeId) {
  let slug = baseSlug || `post-${Date.now()}`
  let attempt = 1

  while (true) {
    const filter = { slug }
    if (excludeId) filter._id = { $ne: excludeId }

    const exists = await BlogPost.exists(filter)
    if (!exists) return slug

    attempt += 1
    slug = `${baseSlug}-${attempt}`.slice(0, 120)
  }
}

/**
 * @param {object} locales
 * @param {boolean} isPublished
 * @param {object|null} coverImage
 * @param {string} slug
 */
function assertPublishable(locales, isPublished, coverImage, slug) {
  if (!isPublished) return

  if (!slug) {
    throw new AppError('Slug is required to publish', 400, 'SLUG_REQUIRED')
  }
  if (!coverImage?.url) {
    throw new AppError('Cover image is required to publish', 400, 'COVER_REQUIRED')
  }
  if (!locales?.fr?.title?.trim()) {
    throw new AppError('French title is required to publish', 400, 'FR_TITLE_REQUIRED')
  }
  if (!locales?.fr?.content?.trim()) {
    throw new AppError('French content is required to publish', 400, 'FR_CONTENT_REQUIRED')
  }
}

/**
 * Liste publique paginée (sans content HTML).
 * @param {object} query
 */
export async function listPublishedPosts(query) {
  const { page, limit, skip } = parsePagination(query, { maxLimit: 24, defaultLimit: 12 })
  const locale = query.locale || 'fr'
  const filter = { isPublished: true }

  if (query.category) filter.category = query.category

  const [posts, total] = await Promise.all([
    BlogPost.find(filter)
      .select(
        '-locales.fr.content -locales.en.content -locales.ar.content -content'
      )
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    BlogPost.countDocuments(filter),
  ])

  return {
    posts: posts.map((p) => formatBlogPublic(p, locale, { includeContent: false })),
    pagination: paginationMeta({ page, limit, total }),
  }
}

/**
 * Détail public par slug + locale.
 * Charge le HTML de la locale demandée + `fr` (fallback), pas les 3 blobs.
 * @param {string} slug
 * @param {string} [locale]
 */
export async function getPublishedPostBySlug(slug, locale = 'fr') {
  const lang = BLOG_LOCALES.includes(locale) ? locale : 'fr'
  /** Toujours garder `fr` pour le fallback ; exclure les autres contenus HTML. */
  const contentProjection =
    lang === 'fr'
      ? '-locales.en.content -locales.ar.content -content'
      : lang === 'en'
        ? '-locales.ar.content -content'
        : '-locales.en.content -content'

  const post = await BlogPost.findOne({ slug, isPublished: true }).select(contentProjection).lean()
  if (!post) {
    throw new AppError('Post not found', 404, 'POST_NOT_FOUND')
  }
  return formatBlogPublic(post, lang, { includeContent: true })
}

/**
 * Liste admin.
 * @param {object} query
 */
export async function listPostsAdmin(query) {
  const { page, limit, skip } = parsePagination(query, { maxLimit: 50, defaultLimit: 20 })
  const filter = {}

  if (query.category) filter.category = query.category
  if (query.isPublished !== undefined) filter.isPublished = query.isPublished

  if (query.q) {
    const regex = { $regex: escapeRegex(query.q), $options: 'i' }
    filter.$or = [
      { slug: regex },
      { 'locales.fr.title': regex },
      { 'locales.en.title': regex },
      { 'locales.ar.title': regex },
      { title: regex },
    ]
  }

  const [posts, total] = await Promise.all([
    BlogPost.find(filter)
      .select(
        '-locales.fr.content -locales.en.content -locales.ar.content -content'
      )
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    BlogPost.countDocuments(filter),
  ])

  return {
    posts: posts.map(formatBlogAdmin),
    pagination: paginationMeta({ page, limit, total }),
  }
}

/**
 * @param {string} id
 */
export async function getPostAdmin(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid post id', 400, 'INVALID_ID')
  }

  const post = await BlogPost.findById(id).lean()
  if (!post) {
    throw new AppError('Post not found', 404, 'POST_NOT_FOUND')
  }

  return formatBlogAdmin(post)
}

/**
 * @param {object} data
 * @param {string} authorId
 */
export async function createPost(data, authorId) {
  const locales = normalizeLocales(data.locales)
  const requestedSlug = data.slug || slugify(locales.fr.title)
  const slug = await ensureUniqueSlug(requestedSlug || `post-${Date.now()}`)

  let coverImage = null
  if (data.coverImageUrl) {
    coverImage = { url: data.coverImageUrl, publicId: null }
  }

  const isPublished = Boolean(data.isPublished)
  assertPublishable(locales, isPublished, coverImage, slug)

  const post = await BlogPost.create({
    slug,
    category: data.category,
    coverImage,
    author: authorId,
    isPublished,
    publishedAt: isPublished ? new Date() : null,
    readingTimeMinutes: estimateReadingTimeMinutes(locales.fr.content),
    locales,
  })

  return formatBlogAdmin(post.toObject())
}

/**
 * @param {string} id
 * @param {object} data
 */
export async function updatePost(id, data) {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid post id', 400, 'INVALID_ID')
  }

  const post = await BlogPost.findById(id)
  if (!post) {
    throw new AppError('Post not found', 404, 'POST_NOT_FOUND')
  }

  if (data.category !== undefined) post.category = data.category

  if (data.locales) {
    const current = extractLocales(post.toObject())
    post.locales = normalizeLocales({
      fr: { ...current.fr, ...data.locales.fr },
      en: { ...current.en, ...data.locales.en },
      ar: { ...current.ar, ...data.locales.ar },
    })
  }

  if (data.slug !== undefined) {
    post.slug = await ensureUniqueSlug(data.slug, id)
  }

  if (data.removeCover) {
    if (post.coverImage?.publicId) {
      await deleteCloudinaryImages([post.coverImage.publicId])
    }
    post.coverImage = null
  }

  if (data.coverImageUrl) {
    if (post.coverImage?.publicId) {
      await deleteCloudinaryImages([post.coverImage.publicId])
    }
    post.coverImage = { url: data.coverImageUrl, publicId: null }
  }

  const wasPublished = post.isPublished
  if (data.isPublished !== undefined) {
    post.isPublished = Boolean(data.isPublished)
  }

  if (post.isPublished && !wasPublished && !post.publishedAt) {
    post.publishedAt = new Date()
  }

  const localesPlain = extractLocales(post.toObject())
  assertPublishable(localesPlain, post.isPublished, post.coverImage, post.slug)

  post.readingTimeMinutes = estimateReadingTimeMinutes(localesPlain.fr?.content || '')
  await post.save()

  return formatBlogAdmin(post.toObject())
}

/**
 * @param {string} id
 */
export async function deletePost(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid post id', 400, 'INVALID_ID')
  }

  const post = await BlogPost.findById(id)
  if (!post) {
    throw new AppError('Post not found', 404, 'POST_NOT_FOUND')
  }

  if (post.coverImage?.publicId) {
    await deleteCloudinaryImages([post.coverImage.publicId])
  }

  await post.deleteOne()
  return { deleted: true, id }
}
