import { Router } from 'express'
import { authenticate } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validate } from '../../middleware/validate.js'
import { uploadRichTextImageFile, handleUploadErrors } from '../../middleware/upload.js'
import { adminMediaDownloadQuerySchema } from './adminMedia.validation.js'
import * as adminMediaController from './adminMedia.controller.js'

const router = Router()

router.use(authenticate, requireRole('admin'))

router.post('/upload', (req, res, next) => {
  uploadRichTextImageFile(req, res, (err) => {
    if (err) return handleUploadErrors(err, req, res, next)
    next()
  })
}, adminMediaController.uploadAdminMedia)

router.get(
  '/download',
  validate(adminMediaDownloadQuerySchema, 'query'),
  adminMediaController.downloadAdminMedia
)

export default router
