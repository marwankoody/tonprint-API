import { Router } from 'express'
import { authenticate } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validate } from '../../middleware/validate.js'
import {
  listAdminDesignsQuerySchema,
  designIdParamSchema,
  rejectDesignSchema,
} from '../designs/design.validation.js'
import * as designController from '../designs/design.controller.js'

const router = Router()

router.use(authenticate, requireRole('admin'))

router.get(
  '/',
  validate(listAdminDesignsQuerySchema, 'query'),
  designController.listAdminDesigns
)

router.get(
  '/:id',
  validate(designIdParamSchema, 'params'),
  designController.getAdminDesign
)

router.post(
  '/:id/approve',
  validate(designIdParamSchema, 'params'),
  designController.approveDesign
)

router.post(
  '/:id/reject',
  validate(designIdParamSchema, 'params'),
  validate(rejectDesignSchema),
  designController.rejectDesign
)

router.delete(
  '/:id',
  validate(designIdParamSchema, 'params'),
  designController.adminDeleteDesign
)

export default router
