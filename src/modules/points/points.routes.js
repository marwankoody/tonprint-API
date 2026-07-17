import { Router } from 'express'
import { authenticate } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validate } from '../../middleware/validate.js'
import {
  listHistoryQuerySchema,
  redeemSchema,
  adminAdjustPointsSchema,
  userIdParamSchema,
} from './points.validation.js'
import * as pointsController from './points.controller.js'

const router = Router()

router.use(authenticate)

router.get('/balance', requireRole('client', 'admin'), pointsController.getBalance)

router.get(
  '/history',
  requireRole('client', 'admin'),
  validate(listHistoryQuerySchema, 'query'),
  pointsController.getHistory
)

router.post('/redeem', requireRole('client', 'admin'), validate(redeemSchema), pointsController.redeem)

/** Ajustement manuel (litige) — admin uniquement. */
router.patch(
  '/admin/users/:id',
  requireRole('admin'),
  validate(userIdParamSchema, 'params'),
  validate(adminAdjustPointsSchema),
  pointsController.adminAdjust
)

export default router
