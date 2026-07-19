import { asyncHandler } from '../../middleware/errorHandler.js'
import * as notificationService from './notification.service.js'
import { registerSseClient } from './notification.hub.js'
import { issueSseTicket } from './sseTicket.store.js'

export const listNotifications = asyncHandler(async (req, res) => {
  const result = await notificationService.listNotifications(
    req.user.id,
    req.validatedQuery ?? req.query
  )
  res.status(200).json({ success: true, data: result })
})

export const getUnreadCount = asyncHandler(async (req, res) => {
  const result = await notificationService.getUnreadCount(req.user.id)
  res.status(200).json({ success: true, data: result })
})

export const markAsRead = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const notification = await notificationService.markAsRead(req.user.id, id)
  res.status(200).json({ success: true, data: { notification } })
})

export const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllAsRead(req.user.id)
  res.status(200).json({ success: true, data: result })
})

export const deleteNotification = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const result = await notificationService.deleteNotification(req.user.id, id)
  res.status(200).json({ success: true, data: result })
})

/** Émet un ticket SSE opaque (TTL ~60s, one-shot). */
export const createSseTicket = asyncHandler(async (req, res) => {
  const data = issueSseTicket(req.user)
  res.status(200).json({ success: true, data })
})

/**
 * SSE — auth déjà faite (Bearer ou ?ticket= one-shot).
 * Pas de JSON response : le flux reste ouvert.
 */
export const streamNotifications = (req, res) => {
  registerSseClient(req, res, req.user)
}
