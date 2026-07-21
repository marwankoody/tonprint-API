import multer from 'multer'
import { AppError } from '../utils/AppError.js'
import { assertImageBuffer } from '../utils/assertImageBuffer.js'

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

/**
 * Après Multer : contrôle magic bytes + alignement avec le MIME déclaré.
 * @param {import('express').Request} req
 */
async function verifyUploadedImageContents(req) {
  /** @type {import('multer').File[]} */
  const files = []
  if (req.file) files.push(req.file)
  if (Array.isArray(req.files)) {
    files.push(...req.files)
  } else if (req.files && typeof req.files === 'object') {
    for (const list of Object.values(req.files)) {
      if (Array.isArray(list)) files.push(...list)
    }
  }

  for (const file of files) {
    const allowOnly = file.fieldname === 'printFile' ? 'image/png' : null
    const detectedMime = await assertImageBuffer(file.buffer, { allowOnly })
    if (file.mimetype && file.mimetype !== detectedMime) {
      throw new AppError(
        'Declared file type does not match file content.',
        400,
        'MIME_MISMATCH'
      )
    }
    file.mimetype = detectedMime
  }
}

/**
 * Traduit les erreurs Multer en AppError lisibles (partagé produits / blog).
 * @type {import('express').ErrorRequestHandler}
 */
export const handleUploadErrors = (err, _req, _res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return next(new AppError('Image too large (max 5 MB)', 400, 'FILE_TOO_LARGE'))
  }
  if (err?.code === 'LIMIT_FILE_COUNT') {
    return next(new AppError('Too many files uploaded', 400, 'TOO_MANY_FILES'))
  }
  return next(err)
}

/**
 * Enchaîne Multer puis la vérification magic-bytes.
 * @param {import('express').RequestHandler} multerMiddleware
 * @returns {import('express').RequestHandler}
 */
function withImageContentCheck(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) return next(err)
      verifyUploadedImageContents(req).then(() => next()).catch(next)
    })
  }
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
export const uploadProductImages = withImageContentCheck(multerInstance.array('images', MAX_FILES))

/**
 * Middleware Multer pour une image inline éditeur riche (1 fichier × 5 Mo).
 * Champ attendu : `image`.
 */
export const uploadRichTextImageFile = withImageContentCheck(
  multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  }).single('image')
)

/**
 * Middleware Multer pour un mockup de zone d'impression (1 fichier × 5 Mo).
 * Champ attendu : `mockup`.
 */
export const uploadPrintAreaMockupFile = withImageContentCheck(
  multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  }).single('mockup')
)

/**
 * Middleware Multer pour une image importée dans l'éditeur de designs (1 fichier × 5 Mo).
 * Champ attendu : `image`.
 */
export const uploadDesignImageFile = withImageContentCheck(
  multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  }).single('image')
)

/** Fichier d'impression 300 DPI : plus lourd qu'une image classique (limite Cloudinary free : 10 Mo). */
const MAX_PRINT_FILE_SIZE = 10 * 1024 * 1024

/**
 * Middleware Multer pour les exports générés par l'éditeur :
 * `preview` (mockup web) + `printFile` (PNG isolé haute résolution).
 */
export const uploadDesignAssetFiles = withImageContentCheck(
  multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_PRINT_FILE_SIZE, files: 2 },
  }).fields([
    { name: 'preview', maxCount: 1 },
    { name: 'printFile', maxCount: 1 },
  ])
)
