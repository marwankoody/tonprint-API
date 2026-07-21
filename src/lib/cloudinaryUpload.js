import { Readable } from 'node:stream'
import { cloudinary } from '../config/cloudinary.js'
import { isCloudinaryConfigured } from '../config/env.js'
import { AppError } from '../utils/AppError.js'
import { assertImageBuffer } from '../utils/assertImageBuffer.js'

const PRODUCT_FOLDER = 'tonprint/products'
const CONTENT_FOLDER = 'tonprint/content'
const MOCKUP_FOLDER = 'tonprint/products/mockups'
const DESIGN_UPLOADS_FOLDER = 'tonprint/designs/uploads'
const DESIGN_PREVIEWS_FOLDER = 'tonprint/designs/previews'
const DESIGN_PRINT_FOLDER = 'tonprint/designs/print-files'

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
 * @param {{ raw?: boolean }} [options] `raw: true` = stocker tel quel (fichiers d'impression PNG)
 * @returns {Promise<{ url: string, publicId: string }>}
 */
function uploadImageToFolder(buffer, folder, originalName = 'image', options = {}) {
  assertCloudinaryReady()

  const safeName = originalName.replace(/[^\w.-]/g, '_').slice(0, 80)

  return new Promise((resolve, reject) => {
    // Magic-bytes déjà vérifiés en middleware upload ; double-check print PNG.
    const precede = options.raw
      ? assertImageBuffer(buffer, { allowOnly: 'image/png' })
      : Promise.resolve()

    precede
      .then(() => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: 'image',
            public_id: `${safeName}-${Date.now()}`,
            overwrite: false,
            // Les fichiers d'impression restent en PNG sans recompression.
            ...(options.raw ? {} : { transformation: [{ fetch_format: 'webp', quality: 'auto' }] }),
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
      .catch(reject)
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
 * Upload une image inline (éditeur riche blog / description produit).
 * @param {Buffer} buffer
 * @param {string} [originalName]
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export async function uploadRichTextImage(buffer, originalName = 'content-image') {
  return uploadImageToFolder(buffer, CONTENT_FOLDER, originalName)
}

/**
 * Upload un mockup de zone d'impression (éditeur de personnalisation).
 * @param {Buffer} buffer
 * @param {string} [originalName]
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export async function uploadPrintAreaMockup(buffer, originalName = 'mockup') {
  return uploadImageToFolder(buffer, MOCKUP_FOLDER, originalName)
}

/**
 * Upload une image importée par un créateur dans l'éditeur de designs.
 * Rangée par utilisateur : `tonprint/designs/uploads/{userId}`.
 * @param {Buffer} buffer
 * @param {string} userId
 * @param {string} [originalName]
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export async function uploadDesignImage(buffer, userId, originalName = 'design-image') {
  const safeUserId = String(userId).replace(/[^\w-]/g, '')
  return uploadImageToFolder(buffer, `${DESIGN_UPLOADS_FOLDER}/${safeUserId}`, originalName)
}

/**
 * Upload la preview (mockup produit + design, qualité web) d'une zone de design.
 * @param {Buffer} buffer
 * @param {string} [originalName]
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export async function uploadDesignPreview(buffer, originalName = 'preview') {
  return uploadImageToFolder(buffer, DESIGN_PREVIEWS_FOLDER, originalName)
}

/**
 * Upload le fichier d'impression (PNG isolé fond transparent, haute résolution).
 * Stocké tel quel — jamais recompressé (destiné à l'imprimeur).
 * @param {Buffer} buffer
 * @param {string} [originalName]
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export async function uploadDesignPrintFile(buffer, originalName = 'print-file') {
  return uploadImageToFolder(buffer, DESIGN_PRINT_FOLDER, originalName, { raw: true })
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
