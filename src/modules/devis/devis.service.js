import mongoose from 'mongoose'
import { Devis, DEVIS_STATUS_TRANSITIONS } from './devis.model.js'
import { AppError } from '../../utils/AppError.js'
import { parsePagination, paginationMeta } from '../../utils/pagination.js'

/** @param {string} value */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** @param {import('mongoose').Document | object} devis */
function formatDevis(devis) {
  const userId =
    devis.user && typeof devis.user === 'object' && devis.user._id
      ? devis.user._id.toString()
      : (devis.user?.toString?.() ?? devis.user ?? null)

  return {
    id: devis._id.toString(),
    company: devis.company,
    contactName: devis.contactName,
    email: devis.email,
    phone: devis.phone,
    products: devis.products || [],
    quantity: devis.quantity,
    deadline: devis.deadline || null,
    details: devis.details,
    status: devis.status,
    user: userId,
    statusHistory: (devis.statusHistory || []).map((h) => ({
      from: h.from,
      to: h.to,
      at: h.at,
      by: h.by?.toString?.() ?? h.by,
    })),
    createdAt: devis.createdAt,
    updatedAt: devis.updatedAt,
  }
}

/**
 * @param {string} userId
 * @param {{
 *   company: string,
 *   contactName: string,
 *   email: string,
 *   phone: string,
 *   products: string[],
 *   quantity: string,
 *   deadline?: string | null,
 *   details: string,
 * }} payload
 */
export async function createDevis(userId, payload) {
  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED')
  }

  const devis = await Devis.create({
    company: payload.company,
    contactName: payload.contactName,
    email: payload.email,
    phone: payload.phone,
    products: payload.products,
    quantity: payload.quantity,
    deadline: payload.deadline || null,
    details: payload.details,
    status: 'new',
    user: userId,
    statusHistory: [
      {
        to: 'new',
        at: new Date(),
        by: userId,
      },
    ],
  })

  return formatDevis(devis)
}

/**
 * @param {string} userId
 * @param {object} query
 */
export async function listMyDevis(userId, query) {
  const { page, limit, skip } = parsePagination(query, { maxLimit: 20, defaultLimit: 10 })
  const filter = { user: userId }

  if (query.status) filter.status = query.status

  const [items, total] = await Promise.all([
    Devis.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Devis.countDocuments(filter),
  ])

  return {
    devis: items.map((d) => formatDevis(d)),
    pagination: paginationMeta({ page, limit, total }),
  }
}

/**
 * @param {string} devisId
 * @param {string} userId
 */
export async function getMyDevisById(devisId, userId) {
  if (!mongoose.isValidObjectId(devisId)) {
    throw new AppError('Invalid devis id', 400, 'INVALID_ID')
  }

  const devis = await Devis.findById(devisId).lean()
  if (!devis) {
    throw new AppError('Quote request not found', 404, 'DEVIS_NOT_FOUND')
  }

  const ownerId = devis.user?.toString?.() ?? devis.user
  if (!ownerId || ownerId !== userId) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN')
  }

  return formatDevis(devis)
}

/** @param {object} query */
export async function listDevisAdmin(query) {
  const { page, limit, skip } = parsePagination(query, { maxLimit: 50, defaultLimit: 20 })
  const filter = {}

  if (query.status) filter.status = query.status

  if (query.dateFrom || query.dateTo) {
    filter.createdAt = {}
    if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom)
    if (query.dateTo) filter.createdAt.$lte = new Date(query.dateTo)
  }

  if (query.q) {
    const q = String(query.q).trim()
    const regex = { $regex: escapeRegex(q), $options: 'i' }
    const or = [
      { company: regex },
      { contactName: regex },
      { email: regex },
      { phone: regex },
    ]
    if (mongoose.isValidObjectId(q)) {
      or.push({ _id: q })
    }
    filter.$or = or
  }

  const [items, total] = await Promise.all([
    Devis.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Devis.countDocuments(filter),
  ])

  return {
    devis: items.map((d) => formatDevis(d)),
    pagination: paginationMeta({ page, limit, total }),
  }
}

/** @param {string} devisId */
export async function getDevisAdmin(devisId) {
  if (!mongoose.isValidObjectId(devisId)) {
    throw new AppError('Invalid devis id', 400, 'INVALID_ID')
  }

  const devis = await Devis.findById(devisId).lean()
  if (!devis) {
    throw new AppError('Quote request not found', 404, 'DEVIS_NOT_FOUND')
  }

  return formatDevis(devis)
}

/**
 * @param {string} devisId
 * @param {string} nextStatus
 * @param {string} adminId
 */
export async function updateDevisStatus(devisId, nextStatus, adminId) {
  if (!mongoose.isValidObjectId(devisId)) {
    throw new AppError('Invalid devis id', 400, 'INVALID_ID')
  }

  const devis = await Devis.findById(devisId)
  if (!devis) {
    throw new AppError('Quote request not found', 404, 'DEVIS_NOT_FOUND')
  }

  const allowed = DEVIS_STATUS_TRANSITIONS[devis.status] || []
  if (!allowed.includes(nextStatus)) {
    throw new AppError(
      `Cannot transition from "${devis.status}" to "${nextStatus}"`,
      400,
      'INVALID_STATUS_TRANSITION'
    )
  }

  const previous = devis.status
  devis.status = nextStatus
  devis.statusHistory.push({
    from: previous,
    to: nextStatus,
    at: new Date(),
    by: adminId,
  })
  await devis.save()

  return formatDevis(devis)
}
