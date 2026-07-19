import { Router } from 'express'
import { authenticate } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validate } from '../../middleware/validate.js'
import { orderCreateLimiter } from '../../middleware/rateLimiters.js'
import {
  listHistoryQuerySchema,
  redeemSchema,
  adminAdjustPointsSchema,
  adminPointsSettingsSchema,
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

/** Échange de points = création de commande → même quota anti-spam que /orders. */
router.post(
  '/redeem',
  orderCreateLimiter,
  requireRole('client', 'admin'),
  validate(redeemSchema),
  pointsController.redeem
)

/** Paramètres paliers (admin) — avant `/admin/users/:id`. */
router.get('/admin/settings', requireRole('admin'), pointsController.getAdminSettings)

router.put(
  '/admin/settings',
  requireRole('admin'),
  validate(adminPointsSettingsSchema),
  pointsController.updateAdminSettings
)

/** Ajustement manuel (litige) — admin uniquement. */
router.patch(
  '/admin/users/:id',
  requireRole('admin'),
  validate(userIdParamSchema, 'params'),
  validate(adminAdjustPointsSchema),
  pointsController.adminAdjust
)

export default router
