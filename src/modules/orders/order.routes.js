import { Router } from 'express'
import { authenticate } from '../../middleware/auth.js'
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

// Toutes les routes commandes exigent une session authentifiée
router.use(authenticate)

router.post(
  '/',
  requireRole('client', 'creator', 'admin'),
  validate(createOrderSchema),
  orderController.createOrder
)

router.get('/', validate(listOrdersQuerySchema, 'query'), orderController.listMyOrders)

// --- Routes admin (dashboard commandes) — avant `/:id` pour éviter le conflit de path ---
router.get(
  '/admin',
  requireRole('admin'),
  validate(adminListOrdersQuerySchema, 'query'),
  orderController.listOrdersAdmin
)

router.get(
  '/admin/:id',
  requireRole('admin'),
  validate(orderIdParamSchema, 'params'),
  orderController.getOrderAdmin
)

router.patch(
  '/admin/:id/status',
  requireRole('admin'),
  validate(orderIdParamSchema, 'params'),
  validate(updateOrderStatusSchema),
  orderController.updateOrderStatus
)

router.get(
  '/:id',
  validate(orderIdParamSchema, 'params'),
  orderController.getOrder
)

router.delete(
  '/:id',
  validate(orderIdParamSchema, 'params'),
  orderController.cancelOrder
)

export default router
