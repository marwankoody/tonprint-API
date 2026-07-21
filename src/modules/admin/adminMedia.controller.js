import { asyncHandler } from '../../middleware/errorHandler.js'
import { AppError } from '../../utils/AppError.js'
import { env } from '../../config/env.js'
import { uploadRichTextImage } from '../../lib/cloudinaryUpload.js'

/**
 * Upload immédiat d'une image pour l'éditeur riche (blog / descriptions).
 * Stockée sur Cloudinary (`tonprint/content`).
 */
export const uploadAdminMedia = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('Image file is required', 400, 'IMAGE_REQUIRED')
  }

  const uploaded = await uploadRichTextImage(req.file.buffer, req.file.originalname)
  res.status(201).json({
    success: true,
    data: { image: uploaded },
  })
})

/**
 * Proxy de téléchargement admin : fetch Cloudinary côté serveur et renvoie
 * le fichier avec Content-Disposition: attachment.
 * Évite CSP connect-src + ouverture d'onglet côté navigateur.
 *
 * Allowlist stricte : https://res.cloudinary.com/{cloud}/…/tonprint/designs/…
 */
export const downloadAdminMedia = asyncHandler(async (req, res) => {
  const { url, filename } = req.validatedQuery ?? req.query
  const cloud = env.CLOUDINARY_CLOUD_NAME

  if (!cloud) {
    throw new AppError('Cloudinary is not configured', 503, 'CLOUDINARY_UNAVAILABLE')
  }

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new AppError('Invalid media URL', 400, 'INVALID_MEDIA_URL')
  }

  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') {
    throw new AppError('Media host not allowed', 400, 'MEDIA_HOST_FORBIDDEN')
  }

  const prefix = `/${cloud}/`
  if (!parsed.pathname.startsWith(prefix) || !parsed.pathname.includes('/tonprint/designs/')) {
    throw new AppError('Media path not allowed', 400, 'MEDIA_PATH_FORBIDDEN')
  }

  let upstream
  try {
    upstream = await fetch(parsed.toString(), {
      redirect: 'follow',
      headers: { Accept: 'image/*,*/*' },
    })
  } catch {
    throw new AppError('Failed to fetch media', 502, 'MEDIA_FETCH_FAILED')
  }

  if (!upstream.ok) {
    throw new AppError('Media not found upstream', 502, 'MEDIA_UPSTREAM_ERROR')
  }

  const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
  const buffer = Buffer.from(await upstream.arrayBuffer())

  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Length', String(buffer.length))
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Cache-Control', 'private, no-store')
  res.status(200).send(buffer)
})
