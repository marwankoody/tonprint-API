import mongoose from 'mongoose'
import { PointsLedger } from './pointsLedger.model.js'
import {
  MILESTONE_SIZE,
  POINTS_PER_MILESTONE,
  milestoneIdempotencyKey,
} from './points.constants.js'
import { User } from '../auth/user.model.js'
import { Order } from '../orders/order.model.js'
import { Design } from '../designs/design.model.js'
import { Product } from '../products/product.model.js'
import { AppError } from '../../utils/AppError.js'
import { parsePagination, paginationMeta } from '../../utils/pagination.js'

/**
 * @param {import('mongoose').Document | object} entry
 */
function formatLedgerEntry(entry) {
  return {
    id: entry._id.toString(),
    type: entry.type,
    amount: entry.amount,
    balanceAfter: entry.balanceAfter,
    reason: entry.reason,
    relatedDesign: entry.relatedDesign?.toString?.() ?? entry.relatedDesign ?? null,
    relatedOrder: entry.relatedOrder?.toString?.() ?? entry.relatedOrder ?? null,
    relatedProduct: entry.relatedProduct?.toString?.() ?? entry.relatedProduct ?? null,
    createdAt: entry.createdAt,
  }
}

/**
 * Crédite des points (idempotent via clé unique ledger).
 * Compatible MongoDB standalone (pas de multi-doc transaction requise).
 *
 * @param {string} userId
 * @param {number} amount
 * @param {string} reason
 * @param {string} idempotencyKey
 * @param {{ relatedDesign?: string|null, relatedOrder?: string|null, relatedProduct?: string|null }} [meta]
 */
export async function creditPoints(userId, amount, reason, idempotencyKey, meta = {}) {
  if (!Number.isInteger(amount) || amount < 1) {
    throw new AppError('Credit amount must be a positive integer', 400, 'INVALID_POINTS_AMOUNT')
  }

  const existing = await PointsLedger.findOne({ idempotencyKey }).lean()
  if (existing) {
    const user = await User.findById(userId).select('pointsBalance').lean()
    return { balance: user?.pointsBalance ?? 0, duplicated: true }
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { pointsBalance: amount } },
    { new: true, select: 'pointsBalance' }
  )
  if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND')

  try {
    await PointsLedger.create({
      user: userId,
      type: 'credit',
      amount,
      balanceAfter: user.pointsBalance,
      reason,
      relatedDesign: meta.relatedDesign || null,
      relatedOrder: meta.relatedOrder || null,
      relatedProduct: meta.relatedProduct || null,
      idempotencyKey,
    })
  } catch (err) {
    if (err?.code === 11000) {
      // Course : une autre requête a gagné — compenser notre $inc.
      await User.updateOne({ _id: userId }, { $inc: { pointsBalance: -amount } })
      const fresh = await User.findById(userId).select('pointsBalance').lean()
      return { balance: fresh?.pointsBalance ?? 0, duplicated: true }
    }
    await User.updateOne({ _id: userId }, { $inc: { pointsBalance: -amount } })
    throw err
  }

  return { balance: user.pointsBalance, duplicated: false }
}

/**
 * Débite des points (garde solde ≥ montant + ledger idempotent).
 * Compatible MongoDB standalone.
 *
 * @param {string} userId
 * @param {number} amount
 * @param {string} reason
 * @param {string} idempotencyKey
 * @param {{ relatedOrder?: string|null, relatedProduct?: string|null }} [meta]
 */
export async function debitPoints(userId, amount, reason, idempotencyKey, meta = {}) {
  if (!Number.isInteger(amount) || amount < 1) {
    throw new AppError('Debit amount must be a positive integer', 400, 'INVALID_POINTS_AMOUNT')
  }

  const existing = await PointsLedger.findOne({ idempotencyKey }).lean()
  if (existing) {
    const user = await User.findById(userId).select('pointsBalance').lean()
    return { balance: user?.pointsBalance ?? 0, duplicated: true }
  }

  const user = await User.findOneAndUpdate(
    { _id: userId, pointsBalance: { $gte: amount } },
    { $inc: { pointsBalance: -amount } },
    { new: true, select: 'pointsBalance' }
  )
  if (!user) {
    throw new AppError('Insufficient points balance', 400, 'INSUFFICIENT_POINTS')
  }

  try {
    await PointsLedger.create({
      user: userId,
      type: 'debit',
      amount,
      balanceAfter: user.pointsBalance,
      reason,
      relatedOrder: meta.relatedOrder || null,
      relatedProduct: meta.relatedProduct || null,
      idempotencyKey,
    })
  } catch (err) {
    if (err?.code === 11000) {
      await User.updateOne({ _id: userId }, { $inc: { pointsBalance: amount } })
      const fresh = await User.findById(userId).select('pointsBalance').lean()
      return { balance: fresh?.pointsBalance ?? 0, duplicated: true }
    }
    await User.updateOne({ _id: userId }, { $inc: { pointsBalance: amount } })
    throw err
  }

  return { balance: user.pointsBalance, duplicated: false }
}

/**
 * Solde courant (cache User — mis à jour atomiquement avec le ledger).
 * @param {string} userId
 */
export async function getBalance(userId) {
  const user = await User.findById(userId).select('pointsBalance').lean()
  if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND')
  return { balance: user.pointsBalance ?? 0 }
}

/**
 * Historique ledger paginé (page-based, index user+createdAt).
 * @param {string} userId
 * @param {{ page?: number, limit?: number }} query
 */
export async function getHistory(userId, query = {}) {
  const { page, limit, skip } = parsePagination(query)

  const [entries, total] = await Promise.all([
    PointsLedger.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PointsLedger.countDocuments({ user: userId }),
  ])

  return {
    entries: entries.map(formatLedgerEntry),
    pagination: paginationMeta({ page, limit, total }),
  }
}

/**
 * Somme des quantités livrées pour un design (via snapshot sourceDesign sur les items).
 * Index : items.sourceDesign + filtre status=delivered.
 * @param {string} designId
 */
export async function countDeliveredSalesForDesign(designId) {
  const designObjectId = new mongoose.Types.ObjectId(designId)
  const [row] = await Order.aggregate([
    { $match: { status: 'delivered', 'items.sourceDesign': designObjectId } },
    { $unwind: '$items' },
    { $match: { 'items.sourceDesign': designObjectId } },
    { $group: { _id: null, totalQty: { $sum: '$items.quantity' } } },
  ])
  return row?.totalQty || 0
}

/**
 * Recalcule les ventes livrées d'un design et crédite les paliers manquants
 * (10, 20, 30… × POINTS_PER_MILESTONE). Idempotent via clés ledger.
 *
 * @param {string} designId
 * @returns {Promise<{ awarded: number, sales: number, balance?: number }>}
 */
export async function checkAndAwardMilestone(designId) {
  if (!mongoose.isValidObjectId(designId)) return { awarded: 0, sales: 0 }

  const design = await Design.findById(designId).select('creator licenseGrantedByCreator status').lean()
  if (!design?.licenseGrantedByCreator) return { awarded: 0, sales: 0 }
  if (!design.creator) return { awarded: 0, sales: 0 }

  const sales = await countDeliveredSalesForDesign(designId)
  const reachedMilestones = Math.floor(sales / MILESTONE_SIZE)
  if (reachedMilestones < 1) return { awarded: 0, sales }

  let awarded = 0
  let lastBalance

  for (let n = 1; n <= reachedMilestones; n++) {
    const units = n * MILESTONE_SIZE
    const key = milestoneIdempotencyKey(designId, units)
    const result = await creditPoints(
      design.creator.toString(),
      POINTS_PER_MILESTONE,
      `Palier ${units} ventes livrées`,
      key,
      { relatedDesign: designId }
    )
    if (!result.duplicated) awarded += POINTS_PER_MILESTONE
    lastBalance = result.balance
  }

  return { awarded, sales, balance: lastBalance }
}

/**
 * Après livraison d'une commande : crédite les paliers pour chaque design marketplace distinct.
 * Erreurs isolées (log) — ne fait pas échouer le changement de statut.
 * @param {{ items?: { sourceDesign?: import('mongoose').Types.ObjectId|string|null }[] }} order
 */
export async function awardMilestonesForDeliveredOrder(order) {
  const designIds = [
    ...new Set(
      (order.items || [])
        .map((item) => item.sourceDesign?.toString?.() ?? item.sourceDesign)
        .filter(Boolean)
    ),
  ]
  const results = []
  for (const designId of designIds) {
    try {
      results.push({ designId, ...(await checkAndAwardMilestone(designId)) })
    } catch (err) {
      console.error(`[points] milestone award failed for design ${designId}:`, err?.message || err)
      results.push({ designId, awarded: 0, error: true })
    }
  }
  return results
}

/**
 * Échange de points contre un produit marketplace (commande points, total 0 MAD).
 * @param {string} userId
 * @param {{ productId: string, quantity?: number, variantId?: string, deliveryAddress: object }} payload
 */
export async function redeemProduct(userId, payload) {
  const quantity = payload.quantity || 1
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    throw new AppError('Invalid quantity', 400, 'INVALID_QUANTITY')
  }

  const product = await Product.findOne({
    _id: payload.productId,
    isPublished: true,
    isPointsRedeemable: true,
    $or: [{ channel: 'marketplace' }, { channel: { $exists: false } }],
  })
  if (!product) {
    throw new AppError('Product not available for points redemption', 404, 'PRODUCT_NOT_FOUND')
  }
  if (!product.pointsCost || product.pointsCost < 1) {
    throw new AppError('Product has no points cost configured', 400, 'INVALID_POINTS_COST')
  }

  let variant = null
  if (payload.variantId) {
    variant = product.variants?.id?.(payload.variantId) || product.variants?.find((v) => v._id.toString() === payload.variantId)
    if (!variant) throw new AppError('Variant not found', 400, 'VARIANT_NOT_FOUND')
  }

  const pointsRequired = product.pointsCost * quantity
  const stockNeeded = quantity
  if ((variant?.stock ?? product.stock) < stockNeeded) {
    throw new AppError('Insufficient stock', 400, 'OUT_OF_STOCK')
  }

  // Stock d'abord (conditionnel) — compensation si le reste échoue.
  let stockDecremented = false
  if (variant) {
    const updated = await Product.findOneAndUpdate(
      { _id: product._id, 'variants._id': variant._id, 'variants.stock': { $gte: stockNeeded } },
      { $inc: { 'variants.$.stock': -stockNeeded, stock: -stockNeeded, popularity: stockNeeded } },
      { new: true }
    )
    if (!updated) throw new AppError('Insufficient stock', 400, 'OUT_OF_STOCK')
    stockDecremented = true
  } else {
    const updated = await Product.findOneAndUpdate(
      { _id: product._id, stock: { $gte: stockNeeded } },
      { $inc: { stock: -stockNeeded, popularity: stockNeeded } },
      { new: true }
    )
    if (!updated) throw new AppError('Insufficient stock', 400, 'OUT_OF_STOCK')
    stockDecremented = true
  }

  const orderId = new mongoose.Types.ObjectId()
  const idempotencyKey = `redeem:${userId}:${orderId.toString()}`

  try {
    const debit = await debitPoints(userId, pointsRequired, `Échange : ${product.name}`, idempotencyKey, {
      relatedProduct: product._id.toString(),
      relatedOrder: orderId.toString(),
    })

    const primaryImage = product.images?.find((i) => i.isPrimary)?.url || product.images?.[0]?.url || ''
    const unitPoints = product.pointsCost
    const order = await Order.create({
      _id: orderId,
      user: userId,
      items: [
        {
          product: product._id,
          design: null,
          sourceDesign: product.sourceDesign || null,
          designSnapshot: null,
          name: product.name,
          image: primaryImage,
          quantity,
          unitPrice: 0,
          lineTotal: 0,
          unitPoints,
          linePoints: pointsRequired,
          variant: variant
            ? { label: variant.label, sku: variant.sku, color: undefined }
            : undefined,
        },
      ],
      totalPrice: 0,
      pointsSpent: pointsRequired,
      status: 'pending_delivery',
      channel: 'marketplace',
      deliveryAddress: payload.deliveryAddress,
      paymentMethod: 'points',
      statusHistory: [{ to: 'pending_delivery', at: new Date(), by: userId }],
    })

    return {
      order: {
        id: order._id.toString(),
        status: order.status,
        paymentMethod: order.paymentMethod,
        totalPrice: 0,
        pointsSpent: pointsRequired,
      },
      balance: debit.balance,
    }
  } catch (err) {
    if (stockDecremented) {
      if (variant) {
        await Product.updateOne(
          { _id: product._id, 'variants._id': variant._id },
          { $inc: { 'variants.$.stock': stockNeeded, stock: stockNeeded, popularity: -stockNeeded } }
        )
      } else {
        await Product.updateOne(
          { _id: product._id },
          { $inc: { stock: stockNeeded, popularity: -stockNeeded } }
        )
      }
    }
    // Si le débit a réussi mais Order.create a échoué, re-créditer.
    const ledger = await PointsLedger.findOne({ idempotencyKey }).lean()
    if (ledger?.type === 'debit') {
      await creditPoints(
        userId,
        pointsRequired,
        `Annulation échange : ${product.name}`,
        `redeem-rollback:${orderId.toString()}`,
        { relatedProduct: product._id.toString(), relatedOrder: orderId.toString() }
      )
    }
    throw err
  }
}

/**
 * Rembourse les points d'une commande annulée (échange points).
 * Idempotent via clé `order-cancel-refund:{orderId}` — safe sur double appel.
 *
 * @param {{ _id: import('mongoose').Types.ObjectId, user?: import('mongoose').Types.ObjectId|null, paymentMethod?: string, pointsSpent?: number }} order
 */
export async function refundPointsForCancelledOrder(order) {
  if (order.paymentMethod !== 'points') return { refunded: 0, skipped: true }

  const amount = order.pointsSpent || 0
  if (!Number.isInteger(amount) || amount < 1) return { refunded: 0, skipped: true }

  const userId = order.user?.toString?.() ?? order.user
  if (!userId) return { refunded: 0, skipped: true }

  const orderId = order._id.toString()
  const result = await creditPoints(
    userId,
    amount,
    `Remboursement annulation #${orderId.slice(-8)}`,
    `order-cancel-refund:${orderId}`,
    { relatedOrder: orderId }
  )

  return { refunded: amount, duplicated: Boolean(result.duplicated), balance: result.balance }
}

/**
 * Ajustement manuel admin (litige) — crédit ou débit avec raison obligatoire.
 * @param {string} userId
 * @param {{ amount: number, type: 'credit'|'debit', reason: string }} payload
 * @param {string} adminId
 */
export async function adminAdjustPoints(userId, payload, adminId) {
  const amount = payload.amount
  const reason = `Admin (${adminId}): ${payload.reason}`.slice(0, 200)
  const key = `admin-adjust:${adminId}:${userId}:${Date.now()}:${amount}:${payload.type}`

  if (payload.type === 'credit') {
    return creditPoints(userId, amount, reason, key)
  }
  return debitPoints(userId, amount, reason, key)
}
