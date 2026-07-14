import { Router } from 'express'
import { authenticate } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validate } from '../../middleware/validate.js'
import { devisFormLimiter } from '../../middleware/rateLimiters.js'
import {
  createDevisSchema,
  adminListDevisQuerySchema,
  devisIdParamSchema,
  updateDevisStatusSchema,
  listMyDevisQuerySchema,
} from './devis.validation.js'
import * as devisController from './devis.controller.js'

const router = Router()

/** Création — compte requis (client ou admin). */
router.post(
  '/',
  devisFormLimiter,
  authenticate,
  requireRole('client', 'admin'),
  validate(createDevisSchema),
  devisController.createDevis
)

/** Suivi entreprise — mes demandes. */
router.get(
  '/mine',
  authenticate,
  requireRole('client', 'admin'),
  validate(listMyDevisQuerySchema, 'query'),
  devisController.listMyDevis
)

router.get(
  '/mine/:id',
  authenticate,
  requireRole('client', 'admin'),
  validate(devisIdParamSchema, 'params'),
  devisController.getMyDevis
)

router.get(
  '/admin',
  authenticate,
  requireRole('admin'),
  validate(adminListDevisQuerySchema, 'query'),
  devisController.listDevisAdmin
)

router.get(
  '/admin/:id',
  authenticate,
  requireRole('admin'),
  validate(devisIdParamSchema, 'params'),
  devisController.getDevisAdmin
)

router.patch(
  '/admin/:id/status',
  authenticate,
  requireRole('admin'),
  validate(devisIdParamSchema, 'params'),
  validate(updateDevisStatusSchema),
  devisController.updateDevisStatus
)

export default router
