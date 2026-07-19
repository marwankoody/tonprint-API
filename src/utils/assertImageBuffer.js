import { fileTypeFromBuffer } from 'file-type'
import { AppError } from './AppError.js'

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

/**
 * Vérifie le contenu binaire d'une image (magic bytes) — refuse SVG / mismatch / inconnu.
 * @param {Buffer} buffer
 * @param {{ allowOnly?: string|null }} [options] ex. `image/png` pour fichiers d'impression
 * @returns {Promise<string>} MIME détecté
 */
export async function assertImageBuffer(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new AppError('Empty or invalid image file', 400, 'INVALID_FILE_CONTENT')
  }

  const detected = await fileTypeFromBuffer(buffer)
  if (!detected || !ALLOWED_IMAGE_MIMES.has(detected.mime)) {
    throw new AppError(
      'Invalid image content. Allowed: JPEG, PNG, WebP, GIF.',
      400,
      'INVALID_FILE_CONTENT'
    )
  }

  if (options.allowOnly && detected.mime !== options.allowOnly) {
    throw new AppError(
      `Invalid file content. Expected ${options.allowOnly}.`,
      400,
      'INVALID_FILE_CONTENT'
    )
  }

  return detected.mime
}
