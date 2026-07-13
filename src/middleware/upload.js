import multer from 'multer'
import { AppError } from '../utils/AppError.js'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 Mo
const MAX_FILES = 5

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const storage = multer.memoryStorage()

function fileFilter(_req, file, cb) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(
      new AppError(
        `Invalid file type "${file.mimetype}". Allowed: JPEG, PNG, WebP, GIF.`,
        400,
        'INVALID_FILE_TYPE'
      )
    )
  }
  cb(null, true)
}

const multerInstance = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
})

/**
 * Middleware Multer pour l'upload d'images produit (mémoire, max 5 fichiers × 5 Mo).
 * Champ attendu : `images`.
 */
export const uploadProductImages = multerInstance.array('images', MAX_FILES)

/**
 * Middleware Multer pour la cover blog (1 fichier × 5 Mo).
 * Champ attendu : `cover`.
 */
export const uploadBlogCover = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
}).single('cover')
