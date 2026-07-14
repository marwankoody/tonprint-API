import { Router } from 'express'
import { authenticate, optionalAuth } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validate } from '../../middleware/validate.js'
import {
  createOrderSchema,
  listOrdersQuerySchema,
  adminListOrdersQuerySchema,
  updateOrderStatusSchema,
  orderIdParamSchema,
} from './order.validation.js'
import * as orderController from './order.controller.js'

const router = Router()

/** Création COD — connecté ou invité. */
router.post('/', optionalAuth, validate(createOrderSchema), orderController.createOrder)

/** Liste des commandes du client connecté. */
router.get(
  '/',
  authenticate,
  validate(listOrdersQuerySchema, 'query'),
  orderController.listMyOrders
)

// --- Admin (avant `/:id` pour éviter le conflit de path) ---
router.get(
  '/admin',
  authenticate,
  requireRole('admin'),
  validate(adminListOrdersQuerySchema, 'query'),
  orderController.listOrdersAdmin
)

router.get(
  '/admin/:id',
  authenticate,
  requireRole('admin'),
  validate(orderIdParamSchema, 'params'),
  orderController.getOrderAdmin
)

router.patch(
  '/admin/:id/status',
  authenticate,
  requireRole('admin'),
  validate(orderIdParamSchema, 'params'),
  validate(updateOrderStatusSchema),
  orderController.updateOrderStatus
)

/** Annulation client — compte requis. */
router.delete(
  '/:id',
  authenticate,
  validate(orderIdParamSchema, 'params'),
  orderController.cancelOrder
)

/**
 * Détail — owner / admin (Bearer) OU invité (X-Guest-Token).
 * En dernier pour ne pas capturer `/admin`.
 */
router.get(
  '/:id',
  optionalAuth,
  validate(orderIdParamSchema, 'params'),
  orderController.getOrder
)

export default router
