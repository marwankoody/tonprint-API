import mongoose from 'mongoose'
import { User, normalizeRoles } from '../auth/user.model.js'
import { Order } from '../orders/order.model.js'
import { AppError } from '../../utils/AppError.js'
import { parsePagination, paginationMeta } from '../../utils/pagination.js'

/** @param {string} value */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * @param {import('mongoose').Document | object} user
 * @param {{ ordersCount?: number }} [extra]
 */
function formatAdminUser(user, extra = {}) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    roles: normalizeRoles(user.roles),
    pointsBalance: user.pointsBalance ?? 0,
    isActive: user.isActive !== false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    ...(extra.ordersCount !== undefined ? { ordersCount: extra.ordersCount } : {}),
  }
}

/**
 * @param {string} actorId
 * @param {string} targetId
 */
function assertNotSelf(actorId, targetId) {
  if (String(actorId) === String(targetId)) {
    throw new AppError('You cannot perform this action on your own account', 400, 'CANNOT_MODIFY_SELF')
  }
}

/**
 * Compte les admins actifs restants (hors éventuellement un user exclu).
 * @param {string} [excludeUserId]
 */
async function countActiveAdmins(excludeUserId) {
  const filter = {
    roles: 'admin',
    isActive: { $ne: false },
  }
  if (excludeUserId) {
    filter._id = { $ne: excludeUserId }
  }
  return User.countDocuments(filter)
}

/**
 * Liste paginée des utilisateurs (admin).
 * @param {object} query
 */
export async function listUsers(query) {
  const { page, limit, skip } = parsePagination(query, { maxLimit: 50, defaultLimit: 20 })
  const filter = {}

  if (query.role) filter.roles = query.role
  if (query.isActive !== undefined) {
    filter.isActive = query.isActive ? { $ne: false } : false
  }

  if (query.q) {
    const regex = { $regex: escapeRegex(String(query.q).trim()), $options: 'i' }
    filter.$or = [{ name: regex }, { email: regex }, { phone: regex }]
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ])

  return {
    users: users.map((u) => formatAdminUser(u)),
    pagination: paginationMeta({ page, limit, total }),
  }
}

/**
 * @param {string} userId
 */
export async function getUserById(userId) {
  if (!mongoose.isValidObjectId(userId)) {
    throw new AppError('Invalid user id', 400, 'INVALID_ID')
  }

  const user = await User.findById(userId).lean()
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND')
  }

  const ordersCount = await Order.countDocuments({ user: userId })
  return formatAdminUser(user, { ordersCount })
}

/**
 * @param {string} userId
 * @param {{ name: string, email: string, phone?: string }} data
 */
export async function updateUserProfile(userId, data) {
  if (!mongoose.isValidObjectId(userId)) {
    throw new AppError('Invalid user id', 400, 'INVALID_ID')
  }

  const emailTaken = await User.exists({ email: data.email, _id: { $ne: userId } })
  if (emailTaken) {
    throw new AppError('An account with this email already exists', 409, 'EMAIL_TAKEN')
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { name: data.name, email: data.email, phone: data.phone || '' } },
    { returnDocument: 'after', runValidators: true }
  ).lean()

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND')
  }

  return formatAdminUser(user)
}

/**
 * @param {string} userId
 * @param {string[]} roles
 * @param {string} actorId
 */
export async function updateUserRoles(userId, roles, actorId) {
  if (!mongoose.isValidObjectId(userId)) {
    throw new AppError('Invalid user id', 400, 'INVALID_ID')
  }
  assertNotSelf(actorId, userId)

  const uniqueRoles = normalizeRoles(roles)
  const user = await User.findById(userId)
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND')
  }

  const wasAdmin = normalizeRoles(user.roles).includes('admin')
  const willBeAdmin = uniqueRoles.includes('admin')

  if (wasAdmin && !willBeAdmin && user.isActive !== false) {
    const remaining = await countActiveAdmins(userId)
    if (remaining < 1) {
      throw new AppError(
        'Cannot remove admin role from the last active admin',
        400,
        'LAST_ADMIN'
      )
    }
  }

  user.roles = uniqueRoles
  await user.save()
  return formatAdminUser(user)
}

/**
 * @param {string} userId
 * @param {boolean} isActive
 * @param {string} actorId
 */
export async function updateUserStatus(userId, isActive, actorId) {
  if (!mongoose.isValidObjectId(userId)) {
    throw new AppError('Invalid user id', 400, 'INVALID_ID')
  }
  assertNotSelf(actorId, userId)

  const user = await User.findById(userId)
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND')
  }

  if (!isActive && normalizeRoles(user.roles).includes('admin') && user.isActive !== false) {
    const remaining = await countActiveAdmins(userId)
    if (remaining < 1) {
      throw new AppError('Cannot disable the last active admin', 400, 'LAST_ADMIN')
    }
  }

  user.isActive = isActive
  if (!isActive) {
    user.refreshTokenHash = null
  }
  await user.save()

  return formatAdminUser(user)
}

/**
 * Hard delete — refusé si l'utilisateur a des commandes.
 * @param {string} userId
 * @param {string} actorId
 */
export async function deleteUser(userId, actorId) {
  if (!mongoose.isValidObjectId(userId)) {
    throw new AppError('Invalid user id', 400, 'INVALID_ID')
  }
  assertNotSelf(actorId, userId)

  const user = await User.findById(userId)
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND')
  }

  if (normalizeRoles(user.roles).includes('admin') && user.isActive !== false) {
    const remaining = await countActiveAdmins(userId)
    if (remaining < 1) {
      throw new AppError('Cannot delete the last active admin', 400, 'LAST_ADMIN')
    }
  }

  const ordersCount = await Order.countDocuments({ user: userId })
  if (ordersCount > 0) {
    throw new AppError(
      'Cannot delete a user with existing orders. Disable the account instead.',
      409,
      'USER_HAS_ORDERS'
    )
  }

  await user.deleteOne()
  return { deleted: true, id: userId }
}
