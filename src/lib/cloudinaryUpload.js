import { Readable } from 'node:stream'
import { cloudinary } from '../config/cloudinary.js'
import { isCloudinaryConfigured } from '../config/env.js'
import { AppError } from '../utils/AppError.js'

const PRODUCT_FOLDER = 'tonprint/products'
const BLOG_FOLDER = 'tonprint/blog'

function assertCloudinaryReady() {
  if (!isCloudinaryConfigured) {
    throw new AppError(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
      503,
      'CLOUDINARY_NOT_CONFIGURED'
    )
  }
}

/**
 * @param {Buffer} buffer
 * @param {string} folder
 * @param {string} [originalName]
 * @returns {Promise<{ url: string, publicId: string }>}
 */
function uploadImageToFolder(buffer, folder, originalName = 'image') {
  assertCloudinaryReady()

  const safeName = originalName.replace(/[^\w.-]/g, '_').slice(0, 80)

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        public_id: `${safeName}-${Date.now()}`,
        overwrite: false,
        transformation: [{ fetch_format: 'webp', quality: 'auto' }],
      },
      (error, result) => {
        if (error) return reject(error)
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        })
      }
    )

    Readable.from(buffer).pipe(uploadStream)
  })
}

/**
 * Upload une image produit vers Cloudinary (format WebP auto, qualité auto).
 * @param {Buffer} buffer
 * @param {string} [originalName]
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export async function uploadProductImage(buffer, originalName = 'product') {
  return uploadImageToFolder(buffer, PRODUCT_FOLDER, originalName)
}

/**
 * Upload une cover blog vers Cloudinary.
 * @param {Buffer} buffer
 * @param {string} [originalName]
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export async function uploadBlogCover(buffer, originalName = 'blog-cover') {
  return uploadImageToFolder(buffer, BLOG_FOLDER, originalName)
}

/**
 * Supprime une ou plusieurs images Cloudinary par leur `publicId`.
 * @param {string[]} publicIds
 */
export async function deleteCloudinaryImages(publicIds) {
  if (!publicIds?.length) return

  assertCloudinaryReady()

  await Promise.all(
    publicIds.map((publicId) =>
      cloudinary.uploader.destroy(publicId, { resource_type: 'image' })
    )
  )
}

/**
 * Construit une URL Cloudinary optimisée pour l'affichage catalogue/fiche.
 * @param {string} publicId
 * @param {{ width?: number }} [options]
 */
export function buildProductImageUrl(publicId, options = {}) {
  const width = options.width ?? 800
  return cloudinary.url(publicId, {
    secure: true,
    transformation: [{ fetch_format: 'webp', quality: 'auto', width }],
  })
}
