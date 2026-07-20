import { Router } from 'express'
import { authenticate } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validate } from '../../middleware/validate.js'
import { adminMediaDownloadQuerySchema } from './adminMedia.validation.js'
import * as adminMediaController from './adminMedia.controller.js'

const router = Router()

router.use(authenticate, requireRole('admin'))

router.get(
  '/download',
  validate(adminMediaDownloadQuerySchema, 'query'),
  adminMediaController.downloadAdminMedia
)

export default router
