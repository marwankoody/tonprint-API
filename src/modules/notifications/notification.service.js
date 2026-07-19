import mongoose from 'mongoose'
import { Notification } from './notification.model.js'
import { User } from '../auth/user.model.js'
import { AppError } from '../../utils/AppError.js'
import { parsePagination, paginationMeta } from '../../utils/pagination.js'
import { sendToUser, broadcastAdmins } from './notification.hub.js'

/**
 * @param {import('mongoose').Document | object} doc
 */
function formatNotification(doc) {
  return {
    id: doc._id.toString(),
    user: doc.user?.toString?.() ?? doc.user,
    audience: doc.audience,
    type: doc.type,
    meta: doc.meta || {},
    readAt: doc.readAt || null,
    createdAt: doc.createdAt,
  }
}

/**
 * Liste paginée des notifications du user connecté.
 * @param {string} userId
 * @param {object} query
 */
export async function listNotifications(userId, query) {
  const { page, limit, skip } = parsePagination(query, { maxLimit: 30, defaultLimit: 20 })
  const filter = { user: userId }

  const [items, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
  ])

  return {
    notifications: items.map(formatNotification),
    pagination: paginationMeta({ page, limit, total }),
  }
}

/**
 * @param {string} userId
 */
export async function getUnreadCount(userId) {
  const count = await Notification.countDocuments({ user: userId, readAt: null })
  return { count }
}

/**
 * @param {string} userId
 * @param {string} notificationId
 */
export async function markAsRead(userId, notificationId) {
  if (!mongoose.isValidObjectId(notificationId)) {
    throw new AppError('Invalid notification id', 400, 'INVALID_ID')
  }

  const doc = await Notification.findOneAndUpdate(
    { _id: notificationId, user: userId, readAt: null },
    { $set: { readAt: new Date() } },
    { new: true }
  ).lean()

  if (!doc) {
    // Déjà lue ou inexistante : une seule requête pour trancher.
    const existing = await Notification.findOne({ _id: notificationId, user: userId }).lean()
    if (!existing) throw new AppError('Notification not found', 404, 'NOT_FOUND')
    return formatNotification(existing)
  }

  return formatNotification(doc)
}

/**
 * @param {string} userId
 */
export async function markAllAsRead(userId) {
  const result = await Notification.updateMany(
    { user: userId, readAt: null },
    { $set: { readAt: new Date() } }
  )
  return { updated: result.modifiedCount || 0 }
}

/**
 * Suppression manuelle (owner only — admin ou client sur sa propre notif).
 * @param {string} userId
 * @param {string} notificationId
 */
export async function deleteNotification(userId, notificationId) {
  if (!mongoose.isValidObjectId(notificationId)) {
    throw new AppError('Invalid notification id', 400, 'INVALID_ID')
  }

  const deleted = await Notification.findOneAndDelete({
    _id: notificationId,
    user: userId,
  }).lean()

  if (!deleted) {
    throw new AppError('Notification not found', 404, 'NOT_FOUND')
  }

  return { deleted: true, id: notificationId }
}

/** Lues : 7 jours après lecture. Non lues : 15 jours après création. */
const READ_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const UNREAD_RETENTION_MS = 15 * 24 * 60 * 60 * 1000

/**
 * Purge les notifications expirées selon la politique de rétention.
 * @returns {Promise<{ deletedRead: number, deletedUnread: number }>}
 */
export async function purgeExpiredNotifications() {
  const now = Date.now()
  const readBefore = new Date(now - READ_RETENTION_MS)
  const unreadBefore = new Date(now - UNREAD_RETENTION_MS)

  const [readResult, unreadResult] = await Promise.all([
    Notification.deleteMany({
      readAt: { $ne: null, $lte: readBefore },
    }),
    Notification.deleteMany({
      readAt: null,
      createdAt: { $lte: unreadBefore },
    }),
  ])

  return {
    deletedRead: readResult.deletedCount || 0,
    deletedUnread: unreadResult.deletedCount || 0,
  }
}

/**
 * Crée une notif par admin actif + push SSE.
 * @param {object} order — document Order (mongoose ou lean)
 */
export async function notifyAdminsOrderCreated(order) {
  const orderId = order._id?.toString?.() || order.id
  if (!orderId) return

  // isActive manquant (anciens comptes) = actif ; seuls les `false` sont exclus.
  const admins = await User.find({
    roles: 'admin',
    isActive: { $ne: false },
  })
    .select('_id')
    .lean()

  if (!admins.length) {
    console.warn('[notifications] order_created: no active admin users found')
    return
  }

  const meta = {
    orderId,
    status: order.status || 'pending_delivery',
    channel: order.channel || 'marketplace',
    paymentMethod: order.paymentMethod || 'cod',
    totalPrice: order.totalPrice ?? 0,
  }

  const docs = admins.map((admin) => ({
    user: admin._id,
    audience: 'admin',
    type: 'order_created',
    meta,
  }))

  const created = await Notification.insertMany(docs)
  const payloads = new Map()
  for (const doc of created) {
    payloads.set(doc.user.toString(), formatNotification(doc))
  }
  broadcastAdmins(payloads)
}

/**
 * Notifie le client propriétaire de la commande (skip guests).
 * @param {object} order
 * @param {string} previousStatus
 * @param {string} nextStatus
 */
export async function notifyClientOrderStatusChanged(order, previousStatus, nextStatus) {
  const userId = order.user?.toString?.() || order.user
  if (!userId) return

  const orderId = order._id?.toString?.() || order.id
  if (!orderId) return

  const doc = await Notification.create({
    user: userId,
    audience: 'user',
    type: 'order_status_changed',
    meta: {
      orderId,
      status: nextStatus,
      previousStatus,
      channel: order.channel || 'marketplace',
      paymentMethod: order.paymentMethod || 'cod',
      totalPrice: order.totalPrice ?? 0,
    },
  })

  sendToUser(userId, formatNotification(doc))
}

/**
 * Fire-and-forget wrapper — ne doit jamais faire échouer le flux commande.
 * @param {() => Promise<void>} fn
 * @param {string} label
 */
export function emitNotification(fn, label) {
  void Promise.resolve()
    .then(fn)
    .catch((err) => {
      console.error(`[notifications] ${label}:`, err?.message || err)
    })
}
