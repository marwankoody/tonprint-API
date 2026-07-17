import { Router } from 'express'
import { authenticate } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validate } from '../../middleware/validate.js'
import { designUploadLimiter } from '../../middleware/rateLimiters.js'
import { uploadDesignImageFile, uploadDesignAssetFiles } from '../../middleware/upload.js'
import {
  createDesignSchema,
  updateDesignSchema,
  listDesignsQuerySchema,
  designIdParamSchema,
  zoneAssetsBodySchema,
} from './design.validation.js'
import * as designController from './design.controller.js'

const router = Router()

// Tout le module est réservé aux comptes connectés (créateurs = rôle client, admin inclus).
router.use(authenticate, requireRole('client', 'admin'))

/** Upload d'une image importée dans l'éditeur — retourne { url, publicId }. */
router.post(
  '/uploads',
  designUploadLimiter,
  uploadDesignImageFile,
  designController.uploadImage
)

router.post('/', validate(createDesignSchema), designController.createDesign)

router.get('/', validate(listDesignsQuerySchema, 'query'), designController.listMyDesigns)

router.post(
  '/:id/submit',
  validate(designIdParamSchema, 'params'),
  designController.submitDesign
)

router.post(
  '/:id/withdraw',
  validate(designIdParamSchema, 'params'),
  designController.withdrawDesign
)

router.get('/:id', validate(designIdParamSchema, 'params'), designController.getMyDesign)

router.put(
  '/:id',
  validate(designIdParamSchema, 'params'),
  validate(updateDesignSchema),
  designController.updateDesign
)

router.delete('/:id', validate(designIdParamSchema, 'params'), designController.deleteDesign)

/** Exports générés par l'éditeur : preview mockup + fichier d'impression PNG. */
router.post(
  '/:id/assets',
  designUploadLimiter,
  validate(designIdParamSchema, 'params'),
  uploadDesignAssetFiles,
  validate(zoneAssetsBodySchema),
  designController.saveZoneAssets
)

export default router
