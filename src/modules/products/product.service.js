import mongoose from 'mongoose'
import { Product } from './product.model.js'
import { AppError } from '../../utils/AppError.js'
import { parsePagination, paginationMeta } from '../../utils/pagination.js'
import { uploadProductImage, deleteProductImages } from '../../lib/cloudinaryUpload.js'

/**
 * @param {import('mongoose').Document | object} product
 */
function formatProduct(product) {
  return {
    id: product._id.toString(),
    name: product.name,
    category: product.category,
    description: product.description,
    printType: product.printType || '',
    variants: product.variants,
    colors: product.colors || [],
    price: product.price,
    compareAtPrice: product.compareAtPrice ?? null,
    wholesalePrice: product.wholesalePrice ?? null,
    wholesaleMoq: product.wholesaleMoq ?? 30,
    images: product.images,
    stock: product.stock,
    isPublished: product.isPublished,
    isPointsRedeemable: product.isPointsRedeemable,
    pointsCost: product.pointsCost,
    popularity: product.popularity,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  }
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
  const { category, minPrice, maxPrice, sort = 'newest' } = query

  const filter = { isPublished: true }

  if (category) filter.category = category
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {}
    if (minPrice !== undefined) filter.price.$gte = minPrice
    if (maxPrice !== undefined) filter.price.$lte = maxPrice
  }

  const [products, total] = await Promise.all([
    Product.find(filter).sort(SORT_MAP[sort] || SORT_MAP.newest).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ])

  return {
    products: products.map(formatProduct),
    pagination: paginationMeta({ page, limit, total }),
  }
}

/**
 * @param {string} id
 */
export async function getProductById(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid product id', 400, 'INVALID_ID')
  }

  const product = await Product.findOne({ _id: id, isPublished: true }).lean()

  if (!product) {
    throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND')
  }

  return formatProduct(product)
}

/** Échappe les caractères spéciaux regex (recherche texte admin sans injection). */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Liste catalogue admin — inclut les brouillons (isPublished: false), filtres larges.
 * @param {import('express').Request['query']} query
 */
export async function listProductsAdmin(query) {
  const { page, limit, skip } = parsePagination(query, { maxLimit: 50, defaultLimit: 20 })
  const { search, category, isPublished } = query

  const filter = {}
  if (category) filter.category = category
  if (isPublished !== undefined) filter.isPublished = isPublished
  if (search) filter.name = { $regex: escapeRegex(search), $options: 'i' }

  const [products, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
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

  const product = await Product.create({ ...data, images })
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
      await deleteProductImages(removedPublicIds)
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

  const publicIds = product.images.map((img) => img.publicId)
  if (publicIds.length) {
    await deleteProductImages(publicIds)
  }

  product.isPublished = false
  product.images = []
  await product.save()

  return { id: product._id.toString(), isPublished: false }
}
