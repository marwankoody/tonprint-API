import { Router } from 'express'
import { authenticate } from '../../middleware/auth.js'
import { authenticateSse } from '../../middleware/authenticateSse.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validate } from '../../middleware/validate.js'
import { sseStreamLimiter, sseTicketLimiter } from '../../middleware/rateLimiters.js'
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} from './notification.validation.js'
import * as notificationController from './notification.controller.js'

const router = Router()

/** Ticket SSE one-shot — Bearer auth, sans JWT dans l'URL du stream. */
router.post(
  '/sse-ticket',
  sseTicketLimiter,
  authenticate,
  requireRole('client', 'admin'),
  notificationController.createSseTicket
)

router.get(
  '/stream',
  sseStreamLimiter,
  authenticateSse,
  requireRole('client', 'admin'),
  notificationController.streamNotifications
)

router.use(authenticate, requireRole('client', 'admin'))

router.get('/', validate(listNotificationsQuerySchema, 'query'), notificationController.listNotifications)
router.get('/unread-count', notificationController.getUnreadCount)
router.patch(
  '/:id/read',
  validate(notificationIdParamSchema, 'params'),
  notificationController.markAsRead
)
router.post('/read-all', notificationController.markAllAsRead)
router.delete(
  '/:id',
  validate(notificationIdParamSchema, 'params'),
  notificationController.deleteNotification
)

export default router
