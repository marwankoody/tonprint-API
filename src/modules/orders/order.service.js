import mongoose from 'mongoose'
import crypto from 'crypto'
import { Order, ORDER_STATUS_TRANSITIONS } from './order.model.js'
import { Product } from '../products/product.model.js'
import { Design } from '../designs/design.model.js'
import { User } from '../auth/user.model.js'
import { AppError } from '../../utils/AppError.js'
import { parsePagination, paginationMeta } from '../../utils/pagination.js'
import { escapeRegex } from '../../utils/escapeRegex.js'
import { findStockOption, sellableQuantity } from '../products/stockStatus.js'

/**
 * Comparaison timing-safe de deux strings (guest tokens).
 * @param {string} a
 * @param {string} b
 */
function safeEqualStrings(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

/**
 * @param {import('mongoose').Document | object} order
 * @param {string | null} [userId]
 * @param {{ includeGuestToken?: boolean, includePrintFiles?: boolean, listMode?: boolean }} [options]
 */
function formatOrder(order, userId, options = {}) {
  const resolvedUserId =
    userId !== undefined
      ? userId
      : order.user && typeof order.user === 'object' && order.user._id
        ? order.user._id.toString()
        : (order.user?.toString?.() ?? order.user ?? null)

  const listMode = Boolean(options.listMode)

  const formatted = {
    id: order._id.toString(),
    user: resolvedUserId,
    isGuest: !resolvedUserId,
    items: (order.items || []).map((item) => {
      const base = {
        id: item._id?.toString?.(),
        product: item.product?.toString?.() ?? item.product,
        design: item.design ? item.design.toString() : null,
        sourceDesign: item.sourceDesign ? item.sourceDesign.toString() : null,
        name: item.name,
        image: item.image || '',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        unitPoints: item.unitPoints || 0,
        linePoints: item.linePoints || 0,
        variant: item.variant || null,
      }
      if (listMode) return base
      return {
        ...base,
        designSnapshot: item.designSnapshot
          ? {
              title: item.designSnapshot.title || '',
              zones: (item.designSnapshot.zones || []).map((zone) => ({
                zone: zone.zone,
                previewUrl: zone.previewUrl || '',
                ...(options.includePrintFiles ? { printFileUrl: zone.printFileUrl || '' } : {}),
              })),
            }
          : null,
      }
    }),
    totalPrice: order.totalPrice,
    pointsSpent: order.pointsSpent || 0,
    status: order.status,
    channel: order.channel || 'marketplace',
    deliveryAddress: order.deliveryAddress,
    paymentMethod: order.paymentMethod || 'cod',
    cancelledAt: order.cancelledAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  }

  if (!listMode) {
    formatted.statusHistory = (order.statusHistory || []).map((h) => ({
      from: h.from,
      to: h.to,
      at: h.at,
      by: h.by?.toString?.() ?? h.by,
    }))
  }

  if (options.includeGuestToken && order.guestAccessToken) {
    formatted.guestAccessToken = order.guestAccessToken
  }

  return formatted
}

/**
 * Format admin : commande + snapshot client (après populate).
 * @param {object} order
 * @param {{ includePrintFiles?: boolean, listMode?: boolean }} [options]
 */
function formatOrderAdmin(order, options = {}) {
  const userDoc = order.user
  const userId =
    userDoc && typeof userDoc === 'object' && userDoc._id
      ? userDoc._id.toString()
      : (userDoc?.toString?.() ?? userDoc ?? null)

  const isGuest = !userId

  const customer =
    !isGuest && userDoc && typeof userDoc === 'object'
      ? {
          id: userId,
          name: userDoc.name ?? '',
          email: userDoc.email ?? '',
          isGuest: false,
        }
      : {
          id: null,
          name: order.deliveryAddress?.fullName || '',
          email: '',
          isGuest: true,
        }

  return {
    ...formatOrder(order, userId, {
      includePrintFiles: options.includePrintFiles ?? true,
      listMode: options.listMode,
    }),
    customer,
  }
}

/**
 * Prix de base : prix de la qualité choisie, sinon prix produit.
 * @param {object} product
 * @param {string} [qualityKey]
 */
function resolveBasePrice(product, qualityKey) {
  if (qualityKey && product.qualities?.length) {
    const quality = product.qualities.find((q) => q.key === qualityKey)
    if (quality) return quality.price
  }
  return product.price
}

/**
 * Prix unitaire serveur : gros si qty ≥ MOQ, sinon prix (qualité) + delta variante.
 * @param {object} product
 * @param {number} quantity
 * @param {object} [variant]
 * @param {string} [qualityKey]
 */
function resolveUnitPrice(product, quantity, variant, qualityKey) {
  const hasWholesale =
    product.wholesalePrice != null &&
    product.wholesalePrice > 0 &&
    quantity >= (product.wholesaleMoq || 30)

  if (hasWholesale) return product.wholesalePrice

  const delta = variant?.priceDelta || 0
  return resolveBasePrice(product, qualityKey) + delta
}

/**
 * @param {object} product
 */
function getPrimaryImageUrl(product) {
  const primary = product.images?.find((img) => img.isPrimary)
  return primary?.url || product.images?.[0]?.url || ''
}

/**
 * Charge et valide les designs commandés par le créateur connecté.
 * @param {{ designId?: string, productId: string }[]} inputItems
 * @param {string | null} userId
 */
async function resolveDesignsForOrder(inputItems, userId) {
  const designIds = [...new Set(inputItems.map((i) => i.designId).filter(Boolean))]
  if (!designIds.length) return new Map()

  if (!userId) {
    throw new AppError('Authentication required to order a custom design', 401, 'UNAUTHORIZED')
  }

  // Projection : le canvasJson (gros Mixed) est inutile pour valider une commande.
  const designs = await Design.find({ _id: { $in: designIds } })
    .select('creator product title variant zones.zone zones.previewUrl zones.printFileUrl')
    .lean()
  const designMap = new Map(designs.map((d) => [d._id.toString(), d]))

  for (const input of inputItems) {
    if (!input.designId) continue

    const design = designMap.get(input.designId)
    if (!design) {
      throw new AppError(`Design not found: ${input.designId}`, 404, 'DESIGN_NOT_FOUND')
    }
    if (design.creator?.toString?.() !== userId) {
      throw new AppError('Insufficient permissions for design order', 403, 'FORBIDDEN')
    }
    if (!design.product) {
      throw new AppError(
        'This design is no longer linked to a catalog product',
        409,
        'PRODUCT_DELETED'
      )
    }
    if (design.product?.toString?.() !== input.productId) {
      throw new AppError('Design does not belong to this product', 400, 'DESIGN_PRODUCT_MISMATCH')
    }
    if (
      !design.zones?.length ||
      design.zones.some((zone) => !zone.previewUrl || !zone.printFileUrl)
    ) {
      throw new AppError('Design must be saved before ordering', 400, 'DESIGN_ASSETS_REQUIRED')
    }
  }

  return designMap
}

/**
 * Décrémente le stock (matrice couleur×taille si présente, sinon agrégat produit).
 * @param {{ productId: string, quantity: number, colorName?: string, sizeLabel?: string }} args
 */
async function decrementStock({ productId, quantity, colorName = '', sizeLabel = '' }) {
  const color = colorName || ''
  const size = sizeLabel || ''

  if (color || size) {
    const arrayFilters = [{ 'cell.colorName': color, 'cell.sizeLabel': size }]
    /** @type {Record<string, number>} */
    const inc = {
      'stockByOption.$[cell].quantity': -quantity,
      stock: -quantity,
      popularity: quantity,
    }
    if (size) {
      inc['variants.$[v].stock'] = -quantity
      arrayFilters.push({ 'v.label': size })
    }

    const updated = await Product.findOneAndUpdate(
      {
        _id: productId,
        isPublished: true,
        stockByOption: {
          $elemMatch: {
            colorName: color,
            sizeLabel: size,
            quantity: { $gte: quantity },
          },
        },
      },
      { $inc: inc },
      { arrayFilters, new: true }
    )
    if (updated) return updated

    const hasMatrix = await Product.exists({
      _id: productId,
      'stockByOption.0': { $exists: true },
    })
    if (hasMatrix) {
      throw new AppError('Insufficient stock for one or more products', 409, 'INSUFFICIENT_STOCK')
    }
  }

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
 * @param {{ product: string|object, quantity: number, variant?: { color?: string, label?: string } }[]} items
 */
async function restoreStock(items) {
  await Promise.all(
    items.map(async (item) => {
      const productId = item.product?.toString?.() ?? item.product
      const quantity = item.quantity
      const color = item.variant?.color || ''
      const size = item.variant?.label || ''

      if (color || size) {
        const arrayFilters = [{ 'cell.colorName': color, 'cell.sizeLabel': size }]
        /** @type {Record<string, number>} */
        const inc = {
          'stockByOption.$[cell].quantity': quantity,
          stock: quantity,
        }
        if (size) {
          inc['variants.$[v].stock'] = quantity
          arrayFilters.push({ 'v.label': size })
        }

        const result = await Product.updateOne(
          {
            _id: productId,
            stockByOption: { $elemMatch: { colorName: color, sizeLabel: size } },
          },
          { $inc: inc },
          { arrayFilters }
        )

        if (result.modifiedCount > 0) {
          await Product.updateOne(
            { _id: productId },
            [
              {
                $set: {
                  popularity: {
                    $max: [0, { $subtract: [{ $ifNull: ['$popularity', 0] }, quantity] }],
                  },
                },
              },
            ],
            { updatePipeline: true }
          )
          return
        }
      }

      await Product.updateOne(
        { _id: productId },
        [
          {
            $set: {
              stock: { $add: ['$stock', quantity] },
              popularity: {
                $max: [0, { $subtract: [{ $ifNull: ['$popularity', 0] }, quantity] }],
              },
            },
          },
        ],
        { updatePipeline: true }
      )
    })
  )
}

/**
 * Compense les décréments déjà réussis en cas d'échec partiel.
 * @param {{ productId: string, quantity: number, colorName?: string, sizeLabel?: string }[]} decremented
 */
async function compensateStock(decremented) {
  if (!decremented.length) return
  await restoreStock(
    decremented.map(({ productId, quantity, colorName, sizeLabel }) => ({
      product: productId,
      quantity,
      variant: { color: colorName || '', label: sizeLabel || '' },
    }))
  )
}

/**
 * Crée une commande COD — prix et stock recalculés côté serveur.
 * `userId` null → commande invité (guestAccessToken pour confirmation).
 *
 * @param {string | null} userId
 * @param {{ items: object[], deliveryAddress: object }} payload
 */
export async function createOrder(userId, payload) {
  const { items: inputItems, deliveryAddress } = payload

  const hasDesignItems = inputItems.some((item) => Boolean(item.designId))
  const hasStandardItems = inputItems.some((item) => !item.designId)

  const designMap = await resolveDesignsForOrder(inputItems, userId)
  const productIds = [...new Set(inputItems.map((i) => i.productId))]
  // Projection : description HTML et printAreas inutiles pour le pricing.
  const products = await Product.find({
    _id: { $in: productIds },
    isPublished: true,
  })
    .select(
      'name channel price wholesalePrice wholesaleMoq qualities variants images sourceDesign colors stockByOption stock'
    )
    .lean()

  const productMap = new Map(products.map((p) => [p._id.toString(), p]))

  /** @type {object[]} */
  const preparedItems = []

  for (const input of inputItems) {
    const product = productMap.get(input.productId)
    if (!product) {
      throw new AppError(`Product not found or unavailable: ${input.productId}`, 404, 'PRODUCT_NOT_FOUND')
    }

    const productChannel = product.channel || 'marketplace'
    if (input.designId) {
      if (productChannel !== 'personalization') {
        throw new AppError(
          `Product ${product.name} is not available for personalization`,
          400,
          'INVALID_PRODUCT_CHANNEL'
        )
      }
    } else if (productChannel === 'personalization') {
      throw new AppError(
        `Product ${product.name} requires a custom design`,
        400,
        'DESIGN_REQUIRED'
      )
    }

    const design = input.designId ? designMap.get(input.designId) : null

    let variant = null
    if (input.variantId) {
      variant = product.variants?.find((v) => v._id.toString() === input.variantId) || null
      if (!variant) {
        throw new AppError(`Variant not found on product ${product.name}`, 400, 'VARIANT_NOT_FOUND')
      }
    } else if (design?.variant?.size) {
      variant = product.variants?.find((v) => v.label === design.variant.size) || null
    }

    const productQualities = product.qualities || []
    let qualityKey = input.quality || design?.variant?.quality || undefined
    if (productQualities.length > 0) {
      if (!qualityKey) {
        throw new AppError(
          `Quality is required for product ${product.name}`,
          400,
          'QUALITY_REQUIRED'
        )
      }
      const quality = productQualities.find((q) => q.key === qualityKey)
      if (!quality) {
        throw new AppError(
          `Quality "${qualityKey}" is not available for product ${product.name}`,
          400,
          'QUALITY_NOT_FOUND'
        )
      }
    } else {
      qualityKey = undefined
    }

    const unitPrice = resolveUnitPrice(product, input.quantity, variant, qualityKey)
    const lineTotal = unitPrice * input.quantity
    const color = design?.variant?.colorName || input.color || undefined
    const colorHexFromDesign = design?.variant?.colorHex || ''
    const colorHexFromProduct =
      color && Array.isArray(product.colors)
        ? product.colors.find((c) => c.name === color)?.hex || ''
        : ''
    const colorHex = colorHexFromDesign || colorHexFromProduct || ''

    if (product.stockByOption?.length) {
      const sizeLabel = variant?.label || design?.variant?.size || ''
      const cell = findStockOption(product.stockByOption, color || '', sizeLabel)
      if (!cell || sellableQuantity(cell) < input.quantity) {
        throw new AppError(
          `Insufficient stock for ${product.name}${color ? ` (${color}` : ''}${sizeLabel ? `${color ? ', ' : ' ('}${sizeLabel}` : ''}${color || sizeLabel ? ')' : ''}`,
          409,
          'INSUFFICIENT_STOCK'
        )
      }
    }

    const designPreview = design?.zones?.find((zone) => zone.previewUrl)?.previewUrl || ''
    const designSnapshot = design
      ? {
          title: design.title,
          zones: design.zones.map((zone) => ({
            zone: zone.zone,
            previewUrl: zone.previewUrl,
            printFileUrl: zone.printFileUrl,
          })),
        }
      : null
    const variantSnapshot =
      variant || color || qualityKey
        ? {
            label: variant?.label || design?.variant?.size || undefined,
            sku: variant?.sku,
            color,
            colorHex: colorHex || undefined,
            quality: qualityKey,
          }
        : undefined

    preparedItems.push({
      product: product._id,
      design: design?._id || null,
      sourceDesign: product.sourceDesign || null,
      designSnapshot,
      name: design ? `${product.name} - ${design.title}` : product.name,
      image: designPreview || getPrimaryImageUrl(product),
      quantity: input.quantity,
      unitPrice,
      lineTotal,
      variant: variantSnapshot,
      _productId: product._id.toString(),
    })
  }

  // Agrège par produit + couleur + taille (matrice stock).
  const qtyByKey = new Map()
  for (const item of preparedItems) {
    const colorName = item.variant?.color || ''
    const sizeLabel = item.variant?.label || ''
    const key = `${item._productId}::${colorName}::${sizeLabel}`
    const prev = qtyByKey.get(key)
    if (prev) {
      prev.quantity += item.quantity
    } else {
      qtyByKey.set(key, {
        productId: item._productId,
        quantity: item.quantity,
        colorName,
        sizeLabel,
      })
    }
  }

  /** @type {{ productId: string, quantity: number, colorName?: string, sizeLabel?: string }[]} */
  const decremented = []

  try {
    const settled = await Promise.allSettled(
      [...qtyByKey.values()].map(async (entry) => {
        await decrementStock(entry)
        decremented.push(entry)
      })
    )
    const failure = settled.find((r) => r.status === 'rejected')
    if (failure) throw failure.reason

    const totalPrice = preparedItems.reduce((sum, item) => sum + item.lineTotal, 0)

    const orderItems = preparedItems.map(({ _productId, ...item }) => item)
    const isGuest = !userId
    const guestAccessToken = isGuest ? crypto.randomBytes(32).toString('hex') : null

    const order = await Order.create({
      user: userId || null,
      guestAccessToken,
      items: orderItems,
      totalPrice,
      status: 'pending_delivery',
      channel:
        hasDesignItems && hasStandardItems
          ? 'mixed'
          : hasDesignItems
            ? 'personalization'
            : 'marketplace',
      deliveryAddress,
      paymentMethod: 'cod',
      pointsSpent: 0,
      statusHistory: [
        {
          to: 'pending_delivery',
          at: new Date(),
          ...(userId ? { by: userId } : {}),
        },
      ],
    })

    const { emitNotification, notifyAdminsOrderCreated } = await import(
      '../notifications/notification.service.js'
    )
    emitNotification(() => notifyAdminsOrderCreated(order), 'order_created')

    return formatOrder(order, userId || null, { includeGuestToken: isGuest })
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
  const { page, limit, skip } = parsePagination(query, { maxLimit: 20, defaultLimit: 15 })
  const filter = { user: userId }

  if (query.status) filter.status = query.status

  if (query.channel === 'personalization') {
    filter.channel = { $in: ['personalization', 'mixed'] }
  } else if (query.channel === 'marketplace') {
    filter.$or = [
      { channel: 'marketplace' },
      { channel: 'mixed' },
      { channel: { $exists: false } },
    ]
  } else if (query.channel === 'mixed') {
    filter.channel = 'mixed'
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .select('-statusHistory -items.designSnapshot')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ])

  return {
    orders: orders.map((o) => formatOrder(o, userId, { listMode: true })),
    pagination: paginationMeta({ page, limit, total }),
  }
}

/**
 * Liste admin — toutes les commandes, filtres status / canal / recherche / dates.
 * @param {object} query
 */
export async function listOrdersAdmin(query) {
  const { page, limit, skip } = parsePagination(query, { maxLimit: 50, defaultLimit: 15 })
  const filter = {}
  const and = []

  if (query.status) filter.status = query.status

  if (query.channel === 'personalization') {
    and.push({ channel: { $in: ['personalization', 'mixed'] } })
  } else if (query.channel === 'marketplace') {
    and.push({
      $or: [
        { channel: 'marketplace' },
        { channel: 'mixed' },
        { channel: { $exists: false } },
      ],
    })
  } else if (query.channel === 'mixed') {
    and.push({ channel: 'mixed' })
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
      .limit(50)
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
      .select('-statusHistory -items.designSnapshot')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email')
      .lean(),
    Order.countDocuments(filter),
  ])

  return {
    orders: orders.map((o) => formatOrderAdmin(o, { listMode: true, includePrintFiles: false })),
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
 * Détail d'une commande — ownership / admin, ou invité via X-Guest-Token.
 * @param {string} orderId
 * @param {{ id: string, roles?: string[] } | null} user
 * @param {string} [guestToken]
 */
export async function getOrderById(orderId, user, guestToken) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new AppError('Invalid order id', 400, 'INVALID_ID')
  }

  const order = await Order.findById(orderId).select('+guestAccessToken').lean()
  if (!order) {
    throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND')
  }

  const isAdmin = Boolean(user?.roles?.includes('admin'))
  const orderUserId = order.user?.toString?.() ?? order.user
  const isOwner = Boolean(user?.id && orderUserId && orderUserId === user.id)
  const isGuestOk =
    !orderUserId &&
    Boolean(guestToken) &&
    Boolean(order.guestAccessToken) &&
    safeEqualStrings(guestToken, order.guestAccessToken)

  if (!isAdmin && !isOwner && !isGuestOk) {
    if (!user && !guestToken) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED')
    }
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN')
  }

  return formatOrder(order, orderUserId || null)
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

  if (!order.user || order.user.toString() !== userId) {
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

  // Rembourse les points avant de figer le statut (idempotent si retry).
  if (order.paymentMethod === 'points' && (order.pointsSpent || 0) > 0) {
    const { refundPointsForCancelledOrder } = await import('../points/points.service.js')
    await refundPointsForCancelledOrder(order)
  }

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
    if (order.paymentMethod === 'points' && (order.pointsSpent || 0) > 0) {
      const { refundPointsForCancelledOrder } = await import('../points/points.service.js')
      await refundPointsForCancelledOrder(order)
    }
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

  // Sécurité points : credits paliers UNIQUEMENT ici, au passage admin → delivered.
  // Aucun endpoint client ne peut déclencher awardMilestonesForDeliveredOrder.
  if (nextStatus === 'delivered') {
    const { awardMilestonesForDeliveredOrder } = await import('../points/points.service.js')
    await awardMilestonesForDeliveredOrder(order)
  }

  const { emitNotification, notifyClientOrderStatusChanged } = await import(
    '../notifications/notification.service.js'
  )
  emitNotification(
    () => notifyClientOrderStatusChanged(order, previous, nextStatus),
    'order_status_changed'
  )

  return formatOrder(order)
}
