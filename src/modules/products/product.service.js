import mongoose from 'mongoose'
import { Product } from './product.model.js'
import { AppError } from '../../utils/AppError.js'
import { parsePagination, paginationMeta } from '../../utils/pagination.js'
import {
  uploadProductImage,
  uploadPrintAreaMockup,
  deleteCloudinaryImages,
} from '../../lib/cloudinaryUpload.js'
import { sanitizeRichHtml } from '../../utils/sanitizeHtml.js'
import { Design } from '../designs/design.model.js'

/**
 * Résout sourceDesign → creator (dénormalisé). Chaîne vide / null détache le lien.
 * @param {object} data
 */
async function resolveSourceDesignFields(data) {
  if (data.sourceDesign === undefined) return data

  if (!data.sourceDesign) {
    return { ...data, sourceDesign: null, creator: null }
  }

  const design = await Design.findById(data.sourceDesign).select('creator licenseGrantedByCreator').lean()
  if (!design) {
    throw new AppError('Source design not found', 404, 'DESIGN_NOT_FOUND')
  }
  if (!design.licenseGrantedByCreator) {
    throw new AppError('Design is not licensed for public sale', 400, 'DESIGN_NOT_LICENSED')
  }

  return {
    ...data,
    sourceDesign: design._id,
    creator: design.creator,
  }
}
/**
 * @param {import('mongoose').Document | object} product
 */
function formatProduct(product) {
  return {
    id: product._id.toString(),
    name: product.name,
    category: product.category,
    channel: product.channel || 'marketplace',
    description: product.description,
    printType: product.printType || '',
    printTypes: product.printTypes || [],
    variants: product.variants,
    colors: product.colors || [],
    qualities: product.qualities || [],
    price: product.price,
    compareAtPrice: product.compareAtPrice ?? null,
    wholesalePrice: product.wholesalePrice ?? null,
    wholesaleMoq: product.wholesaleMoq ?? 30,
    images: product.images,
    stock: product.stock,
    isPublished: product.isPublished,
    isPointsRedeemable: product.isPointsRedeemable,
    pointsCost: product.pointsCost,
    sourceDesign: product.sourceDesign?.toString?.() ?? product.sourceDesign ?? null,
    creator: product.creator?.toString?.() ?? product.creator ?? null,
    popularity: product.popularity,
    // Présent uniquement sur les endpoints détail (exclu des listes par projection).
    ...(product.printAreas !== undefined ? { printAreas: product.printAreas } : {}),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  }
}

/** Projection listes : mockups + description HTML inutiles hors détail. */
const LIST_PROJECTION = '-printAreas -description'

/** Tous les publicIds Cloudinary des mockups d'un produit. */
function collectMockupPublicIds(printAreas = []) {
  return printAreas.flatMap((area) => (area.mockups || []).map((m) => m.publicId))
}

/** Filtre canal : docs sans `channel` = marketplace (rétrocompat). */
function channelFilter(channel = 'marketplace') {
  if (channel === 'personalization') {
    return { channel: 'personalization' }
  }
  return { $or: [{ channel: 'marketplace' }, { channel: { $exists: false } }] }
}

const SORT_MAP = {
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  popularity: { popularity: -1, createdAt: -1 },
  newest: { createdAt: -1 },
}

/**
 * @param {import('express').Request['query']} query
 */
export async function listProducts(query) {
  const { page, limit, skip } = parsePagination(query, { maxLimit: 20, defaultLimit: 12 })
  const { category, minPrice, maxPrice, sort = 'newest', channel = 'marketplace', search, redeemable } =
    query

  const filter = {
    isPublished: true,
    ...channelFilter(channel),
  }

  if (category) filter.category = category
  // Index text sur `name` — préférer `$text` à un regex full-scan. explain() en staging.
  const searchTerm = typeof search === 'string' ? search.trim() : ''
  if (searchTerm) filter.$text = { $search: searchTerm }
  if (redeemable === true) {
    filter.isPointsRedeemable = true
    filter.pointsCost = { $gt: 0 }
  }
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {}
    if (minPrice !== undefined) filter.price.$gte = minPrice
    if (maxPrice !== undefined) filter.price.$lte = maxPrice
  }

  const sortSpec = searchTerm
    ? { score: { $meta: 'textScore' }, ...(SORT_MAP[sort] || SORT_MAP.newest) }
    : SORT_MAP[sort] || SORT_MAP.newest

  let findQuery = Product.find(filter).select(LIST_PROJECTION)
  if (searchTerm) {
    findQuery = findQuery.select({ score: { $meta: 'textScore' } })
  }

  const [products, total] = await Promise.all([
    findQuery.sort(sortSpec).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ])

  return {
    products: products.map(formatProduct),
    pagination: paginationMeta({ page, limit, total }),
  }
}

/**
 * @param {string} id
 * @param {{ channel?: string }} [options]
 */
export async function getProductById(id, options = {}) {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid product id', 400, 'INVALID_ID')
  }

  const channel = options.channel || 'marketplace'
  const product = await Product.findOne({
    _id: id,
    isPublished: true,
    ...channelFilter(channel),
  }).lean()

  if (!product) {
    throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND')
  }

  return formatProduct(product)
}

/**
 * Liste catalogue admin — inclut les brouillons (isPublished: false), filtres larges.
 * @param {import('express').Request['query']} query
 */
export async function listProductsAdmin(query) {
  const { page, limit, skip } = parsePagination(query, { maxLimit: 50, defaultLimit: 20 })
  const { search, category, isPublished, channel } = query

  const filter = {}
  if (category) filter.category = category
  if (channel) Object.assign(filter, channelFilter(channel))
  if (isPublished !== undefined) filter.isPublished = isPublished
  const searchTerm = typeof search === 'string' ? search.trim() : ''
  if (searchTerm) filter.$text = { $search: searchTerm }

  let findQuery = Product.find(filter).select(LIST_PROJECTION)
  const sortSpec = searchTerm
    ? { score: { $meta: 'textScore' }, createdAt: -1 }
    : { createdAt: -1 }
  if (searchTerm) {
    findQuery = findQuery.select({ score: { $meta: 'textScore' } })
  }

  const [products, total] = await Promise.all([
    findQuery.sort(sortSpec).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ])

  return {
    products: products.map(formatProduct),
    pagination: paginationMeta({ page, limit, total }),
  }
}

/**
 * Récupère un produit par id (admin) — brouillons inclus.
 * @param {string} id
 */
export async function getProductByIdAdmin(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid product id', 400, 'INVALID_ID')
  }

  const product = await Product.findById(id).lean()

  if (!product) {
    throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND')
  }

  return formatProduct(product)
}

/**
 * @param {import('express').Request['files']} files
 */
async function uploadImagesFromFiles(files = []) {
  if (!files.length) return []

  const uploads = await Promise.all(
    files.map((file) => uploadProductImage(file.buffer, file.originalname))
  )

  return uploads.map((img, index) => ({
    url: img.url,
    publicId: img.publicId,
    isPrimary: index === 0,
  }))
}

/**
 * @param {object} data
 * @param {import('express').Request['files']} [files]
 */
export async function createProduct(data, files = []) {
  const images = await uploadImagesFromFiles(files)

  if (!images.length) {
    throw new AppError('At least one product image is required', 400, 'IMAGES_REQUIRED')
  }

  const resolved = await resolveSourceDesignFields(data)

  const product = await Product.create({
    ...resolved,
    description: sanitizeRichHtml(resolved.description || ''),
    images,
  })
  return formatProduct(product)
}

/**
 * @param {string} id
 * @param {object} data
 * @param {import('express').Request['files']} [files]
 */
export async function updateProduct(id, data, files = []) {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid product id', 400, 'INVALID_ID')
  }

  const product = await Product.findById(id)
  if (!product) {
    throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND')
  }

  const { removeImagePublicIds, ...fields } = data

  if (removeImagePublicIds?.length) {
    const toRemove = new Set(removeImagePublicIds)
    const removedPublicIds = product.images
      .filter((img) => toRemove.has(img.publicId))
      .map((img) => img.publicId)

    if (removedPublicIds.length) {
      await deleteCloudinaryImages(removedPublicIds)
      product.images = product.images.filter((img) => !toRemove.has(img.publicId))
    }
  }

  if (files?.length) {
    const newImages = await uploadImagesFromFiles(files)
    product.images.push(...newImages.map((img) => ({ ...img, isPrimary: false })))
  }

  if (product.images.length && !product.images.some((img) => img.isPrimary)) {
    product.images[0].isPrimary = true
  }

  if (fields.description !== undefined) {
    fields.description = sanitizeRichHtml(fields.description)
  }

  if (fields.sourceDesign !== undefined) {
    const resolved = await resolveSourceDesignFields(fields)
    fields.sourceDesign = resolved.sourceDesign
    fields.creator = resolved.creator
  }

  // printAreas remplacées : supprimer de Cloudinary les mockups qui ne sont plus référencés.
  if (fields.printAreas !== undefined) {
    const nextIds = new Set(collectMockupPublicIds(fields.printAreas))
    const orphanIds = collectMockupPublicIds(product.printAreas).filter((id) => !nextIds.has(id))
    if (orphanIds.length) {
      await deleteCloudinaryImages(orphanIds)
    }
  }

  Object.assign(product, fields)
  await product.save()

  return formatProduct(product)
}

/**
 * Dépublie un produit (soft delete) et supprime ses images Cloudinary.
 * @param {string} id
 */
export async function deleteProduct(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid product id', 400, 'INVALID_ID')
  }

  const product = await Product.findById(id)
  if (!product) {
    throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND')
  }

  const publicIds = [
    ...product.images.map((img) => img.publicId),
    ...collectMockupPublicIds(product.printAreas),
  ]
  if (publicIds.length) {
    await deleteCloudinaryImages(publicIds)
  }

  product.isPublished = false
  product.images = []
  product.printAreas = []
  await product.save()

  return { id: product._id.toString(), isPublished: false }
}

/**
 * Upload d'un mockup de zone d'impression (admin) — retourne l'URL Cloudinary
 * à référencer dans `printAreas[].mockups[]` du formulaire produit.
 * @param {{ buffer: Buffer, originalname: string }} file
 */
export async function uploadMockup(file) {
  if (!file?.buffer) {
    throw new AppError('Mockup image file is required', 400, 'MOCKUP_REQUIRED')
  }
  return uploadPrintAreaMockup(file.buffer, file.originalname)
}
