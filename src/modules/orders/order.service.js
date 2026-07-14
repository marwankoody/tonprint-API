import mongoose from 'mongoose'
import { Order, ORDER_STATUS_TRANSITIONS } from './order.model.js'
import { Product } from '../products/product.model.js'
import { User } from '../auth/user.model.js'
import { AppError } from '../../utils/AppError.js'
import { parsePagination, paginationMeta } from '../../utils/pagination.js'

/** @param {string} value */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * @param {import('mongoose').Document | object} order
 * @param {string} [userId]
 */
function formatOrder(order, userId) {
  const resolvedUserId =
    userId ??
    (order.user && typeof order.user === 'object' && order.user._id
      ? order.user._id.toString()
      : (order.user?.toString?.() ?? order.user))

  return {
    id: order._id.toString(),
    user: resolvedUserId,
    items: (order.items || []).map((item) => ({
      id: item._id?.toString?.(),
      product: item.product?.toString?.() ?? item.product,
      design: item.design ? item.design.toString() : null,
      name: item.name,
      image: item.image || '',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      variant: item.variant || null,
    })),
    totalPrice: order.totalPrice,
    status: order.status,
    channel: order.channel || 'marketplace',
    deliveryAddress: order.deliveryAddress,
    paymentMethod: order.paymentMethod,
    cancelledAt: order.cancelledAt,
    statusHistory: (order.statusHistory || []).map((h) => ({
      from: h.from,
      to: h.to,
      at: h.at,
      by: h.by?.toString?.() ?? h.by,
    })),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  }
}

/**
 * Format admin : commande + snapshot client (après populate).
 * @param {object} order
 */
function formatOrderAdmin(order) {
  const userDoc = order.user
  const userId =
    userDoc && typeof userDoc === 'object' && userDoc._id
      ? userDoc._id.toString()
      : (userDoc?.toString?.() ?? userDoc)

  const customer =
    userDoc && typeof userDoc === 'object' && (userDoc.name != null || userDoc.email != null)
      ? {
          id: userId,
          name: userDoc.name ?? '',
          email: userDoc.email ?? '',
        }
      : null

  return {
    ...formatOrder(order, userId),
    customer,
  }
}

/**
 * Prix unitaire serveur : gros si qty ≥ MOQ, sinon prix détail + delta variante.
 * @param {object} product
 * @param {number} quantity
 * @param {object} [variant]
 */
function resolveUnitPrice(product, quantity, variant) {
  const hasWholesale =
    product.wholesalePrice != null &&
    product.wholesalePrice > 0 &&
    quantity >= (product.wholesaleMoq || 30)

  if (hasWholesale) return product.wholesalePrice

  const delta = variant?.priceDelta || 0
  return product.price + delta
}

/**
 * @param {object} product
 */
function getPrimaryImageUrl(product) {
  const primary = product.images?.find((img) => img.isPrimary)
  return primary?.url || product.images?.[0]?.url || ''
}

/**
 * Décrémente le stock produit de façon atomique.
 * @param {string} productId
 * @param {number} quantity
 */
async function decrementStock(productId, quantity) {
  const updated = await Product.findOneAndUpdate(
    { _id: productId, isPublished: true, stock: { $gte: quantity } },
    { $inc: { stock: -quantity, popularity: quantity } },
    { new: true }
  )

  if (!updated) {
    throw new AppError('Insufficient stock for one or more products', 409, 'INSUFFICIENT_STOCK')
  }

  return updated
}

/**
 * Restaure le stock après annulation (popularity bornée à ≥ 0).
 * @param {{ product: string|object, quantity: number }[]} items
 */
async function restoreStock(items) {
  await Promise.all(
    items.map(async (item) => {
      const productId = item.product?.toString?.() ?? item.product
      await Product.updateOne({ _id: productId }, { $inc: { stock: item.quantity } })

      const dec = await Product.updateOne(
        { _id: productId, popularity: { $gte: item.quantity } },
        { $inc: { popularity: -item.quantity } }
      )
      if (dec.modifiedCount === 0) {
        await Product.updateOne({ _id: productId }, { $set: { popularity: 0 } })
      }
    })
  )
}

/**
 * Compense les décréments déjà réussis en cas d'échec partiel.
 * @param {{ productId: string, quantity: number }[]} decremented
 */
async function compensateStock(decremented) {
  if (!decremented.length) return
  await restoreStock(decremented.map(({ productId, quantity }) => ({ product: productId, quantity })))
}

/**
 * Crée une commande COD — prix et stock recalculés côté serveur.
 *
 * @param {string} userId
 * @param {{ items: object[], deliveryAddress: object }} payload
 */
export async function createOrder(userId, payload) {
  const { items: inputItems, deliveryAddress } = payload

  const productIds = [...new Set(inputItems.map((i) => i.productId))]
  const products = await Product.find({
    _id: { $in: productIds },
    isPublished: true,
    $or: [{ channel: 'marketplace' }, { channel: { $exists: false } }],
  }).lean()

  const productMap = new Map(products.map((p) => [p._id.toString(), p]))

  /** @type {object[]} */
  const preparedItems = []

  for (const input of inputItems) {
    const product = productMap.get(input.productId)
    if (!product) {
      throw new AppError(`Product not found or unavailable: ${input.productId}`, 404, 'PRODUCT_NOT_FOUND')
    }

    let variant = null
    if (input.variantId) {
      variant = product.variants?.find((v) => v._id.toString() === input.variantId) || null
      if (!variant) {
        throw new AppError(`Variant not found on product ${product.name}`, 400, 'VARIANT_NOT_FOUND')
      }
    }

    const unitPrice = resolveUnitPrice(product, input.quantity, variant)
    const lineTotal = unitPrice * input.quantity

    preparedItems.push({
      product: product._id,
      design: input.designId || null,
      name: product.name,
      image: getPrimaryImageUrl(product),
      quantity: input.quantity,
      unitPrice,
      lineTotal,
      variant:
        variant || input.color
          ? {
              label: variant?.label,
              sku: variant?.sku,
              color: input.color || undefined,
            }
          : undefined,
      _productId: product._id.toString(),
    })
  }

  // Agrège les quantités par produit (même produit sur plusieurs lignes)
  const qtyByProduct = new Map()
  for (const item of preparedItems) {
    qtyByProduct.set(item._productId, (qtyByProduct.get(item._productId) || 0) + item.quantity)
  }

  /** @type {{ productId: string, quantity: number }[]} */
  const decremented = []

  try {
    for (const [productId, quantity] of qtyByProduct) {
      await decrementStock(productId, quantity)
      decremented.push({ productId, quantity })
    }

    const totalPrice = preparedItems.reduce((sum, item) => sum + item.lineTotal, 0)

    const orderItems = preparedItems.map(({ _productId, ...item }) => item)

    const order = await Order.create({
      user: userId,
      items: orderItems,
      totalPrice,
      status: 'pending_delivery',
      channel: 'marketplace',
      deliveryAddress,
      paymentMethod: 'cod',
      statusHistory: [
        {
          to: 'pending_delivery',
          at: new Date(),
          by: userId,
        },
      ],
    })

    return formatOrder(order)
  } catch (err) {
    await compensateStock(decremented)
    throw err
  }
}

/**
 * Liste paginée des commandes de l'utilisateur connecté.
 * @param {string} userId
 * @param {object} query
 */
export async function listMyOrders(userId, query) {
  const { page, limit, skip } = parsePagination(query, { maxLimit: 20, defaultLimit: 10 })
  const filter = { user: userId }

  if (query.status) filter.status = query.status

  if (query.channel === 'personalization') {
    filter.channel = 'personalization'
  } else if (query.channel === 'marketplace') {
    filter.$or = [{ channel: 'marketplace' }, { channel: { $exists: false } }]
  }

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ])

  return {
    orders: orders.map(formatOrder),
    pagination: paginationMeta({ page, limit, total }),
  }
}

/**
 * Liste admin — toutes les commandes, filtres status / canal / recherche / dates.
 * @param {object} query
 */
export async function listOrdersAdmin(query) {
  const { page, limit, skip } = parsePagination(query, { maxLimit: 50, defaultLimit: 20 })
  const filter = {}
  const and = []

  if (query.status) filter.status = query.status

  if (query.channel === 'personalization') {
    and.push({ channel: 'personalization' })
  } else if (query.channel === 'marketplace') {
    and.push({ $or: [{ channel: 'marketplace' }, { channel: { $exists: false } }] })
  }

  if (query.dateFrom || query.dateTo) {
    filter.createdAt = {}
    if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom)
    if (query.dateTo) filter.createdAt.$lte = new Date(query.dateTo)
  }

  if (query.q) {
    const q = String(query.q).trim()
    const or = []

    if (mongoose.isValidObjectId(q)) {
      or.push({ _id: q })
    }

    const regex = { $regex: escapeRegex(q), $options: 'i' }
    or.push(
      { 'deliveryAddress.fullName': regex },
      { 'deliveryAddress.phone': regex },
      { 'deliveryAddress.city': regex }
    )

    const matchingUsers = await User.find({
      $or: [{ email: regex }, { name: regex }],
    })
      .select('_id')
      .lean()

    if (matchingUsers.length) {
      or.push({ user: { $in: matchingUsers.map((u) => u._id) } })
    }

    and.push({ $or: or })
  }

  if (and.length === 1) {
    Object.assign(filter, and[0])
  } else if (and.length > 1) {
    filter.$and = and
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email')
      .lean(),
    Order.countDocuments(filter),
  ])

  return {
    orders: orders.map(formatOrderAdmin),
    pagination: paginationMeta({ page, limit, total }),
  }
}

/**
 * Détail admin — commande + client (sans check ownership).
 * @param {string} orderId
 */
export async function getOrderAdmin(orderId) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new AppError('Invalid order id', 400, 'INVALID_ID')
  }

  const order = await Order.findById(orderId).populate('user', 'name email').lean()
  if (!order) {
    throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND')
  }

  return formatOrderAdmin(order)
}

/**
 * Détail d'une commande — ownership (admin bypass).
 * @param {string} orderId
 * @param {{ id: string, roles?: string[] }} user
 */
export async function getOrderById(orderId, user) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new AppError('Invalid order id', 400, 'INVALID_ID')
  }

  const order = await Order.findById(orderId).lean()
  if (!order) {
    throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND')
  }

  const isAdmin = user.roles?.includes('admin')
  const isOwner = order.user.toString() === user.id

  if (!isAdmin && !isOwner) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN')
  }

  return formatOrder(order)
}

/**
 * Annulation client — uniquement si `pending_delivery`.
 * @param {string} orderId
 * @param {string} userId
 */
export async function cancelOrder(orderId, userId) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new AppError('Invalid order id', 400, 'INVALID_ID')
  }

  const order = await Order.findById(orderId)
  if (!order) {
    throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND')
  }

  if (order.user.toString() !== userId) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN')
  }

  if (order.status !== 'pending_delivery') {
    throw new AppError(
      'Only orders with status pending_delivery can be cancelled',
      400,
      'ORDER_NOT_CANCELLABLE'
    )
  }

  await restoreStock(order.items)

  const previous = order.status
  order.status = 'cancelled'
  order.cancelledAt = new Date()
  order.statusHistory.push({
    from: previous,
    to: 'cancelled',
    at: new Date(),
    by: userId,
  })
  await order.save()

  return formatOrder(order)
}

/**
 * Mise à jour de statut (admin) avec transitions contrôlées.
 * @param {string} orderId
 * @param {string} nextStatus
 * @param {string} adminId
 */
export async function updateOrderStatus(orderId, nextStatus, adminId) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new AppError('Invalid order id', 400, 'INVALID_ID')
  }

  const order = await Order.findById(orderId)
  if (!order) {
    throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND')
  }

  const allowed = ORDER_STATUS_TRANSITIONS[order.status] || []
  if (!allowed.includes(nextStatus)) {
    throw new AppError(
      `Cannot transition from "${order.status}" to "${nextStatus}"`,
      400,
      'INVALID_STATUS_TRANSITION'
    )
  }

  if (nextStatus === 'cancelled') {
    await restoreStock(order.items)
    order.cancelledAt = new Date()
  }

  const previous = order.status
  order.status = nextStatus
  order.statusHistory.push({
    from: previous,
    to: nextStatus,
    at: new Date(),
    by: adminId,
  })
  await order.save()

  return formatOrder(order)
}
