import { Order, ORDER_STATUSES } from '../orders/order.model.js'
import { Design, DESIGN_STATUSES } from '../designs/design.model.js'
import { Devis, DEVIS_STATUSES } from '../devis/devis.model.js'
import { Product } from '../products/product.model.js'
import { User } from '../auth/user.model.js'
import { monthKey, buildMonthBuckets } from '../../utils/monthBuckets.js'

const MONTH_WINDOW = 6
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Compteurs par statut via countDocuments indexés (évite $group full-collection).
 * @param {import('mongoose').Model} Model
 * @param {readonly string[]} statuses
 * @param {object} [baseFilter]
 */
async function countsByStatus(Model, statuses, baseFilter = {}) {
  const rows = await Promise.all(
    statuses.map(async (status) => ({
      _id: status,
      count: await Model.countDocuments({ ...baseFilter, status }),
    }))
  )
  return rows.reduce((acc, row) => {
    acc[row._id] = row.count
    return acc
  }, {})
}

function sumStatusMap(map) {
  return Object.values(map).reduce((sum, n) => sum + n, 0)
}

/**
 * Dashboard admin — une seule réponse, agrégations parallèles bornées.
 */
export async function getAdminDashboard() {
  const monthStarts = buildMonthBuckets(MONTH_WINDOW)
  const activityStart = monthStarts[0]
  const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS)

  const [
    ordersByStatus,
    designsByStatus,
    quotesByStatus,
    publishedProducts,
    draftProducts,
    clientUsers,
    activeClients,
    revenue30dRows,
    deliveredRevenueRows,
    monthlyRows,
    attentionOrders,
    attentionDesigns,
    attentionQuotes,
    recentOrders,
    recentUsers,
  ] = await Promise.all([
    countsByStatus(Order, ORDER_STATUSES),
    countsByStatus(Design, DESIGN_STATUSES),
    countsByStatus(Devis, DEVIS_STATUSES),
    Product.countDocuments({ isPublished: true }),
    Product.countDocuments({ isPublished: false }),
    User.countDocuments({ roles: 'client' }),
    User.countDocuments({ roles: 'client', isActive: { $ne: false } }),
    Order.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
          paymentMethod: { $ne: 'points' },
          status: 'delivered',
        },
      },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$totalPrice' },
          orders: { $sum: 1 },
        },
      },
    ]),
    Order.aggregate([
      {
        $match: {
          status: 'delivered',
          paymentMethod: { $ne: 'points' },
        },
      },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$totalPrice' },
          orders: { $sum: 1 },
        },
      },
    ]),
    Order.aggregate([
      {
        $match: {
          createdAt: { $gte: activityStart },
          paymentMethod: { $ne: 'points' },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          orders: { $sum: 1 },
          revenue: { $sum: '$totalPrice' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.find({ status: { $in: ['pending_delivery', 'processing'] } })
      .sort({ createdAt: -1 })
      .limit(8)
      .select('status channel totalPrice paymentMethod pointsSpent createdAt deliveryAddress.fullName')
      .lean(),
    Design.find({ status: 'pending_review' })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select('title status updatedAt createdAt zones.previewUrl')
      .lean(),
    Devis.find({ status: 'new' })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('company contactName status createdAt products')
      .lean(),
    Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('status channel totalPrice paymentMethod pointsSpent createdAt deliveryAddress.fullName')
      .lean(),
    User.find({ roles: 'client' })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email isActive createdAt')
      .lean(),
  ])

  const monthlyByKey = new Map(monthlyRows.map((row) => [row._id, row]))

  const revenue30d = revenue30dRows[0] || { revenue: 0, orders: 0 }
  const deliveredRevenue = deliveredRevenueRows[0] || { revenue: 0, orders: 0 }

  const pendingOrdersCount =
    (ordersByStatus.pending_delivery || 0) + (ordersByStatus.processing || 0)

  const formatOrderRow = (order) => ({
    id: order._id.toString(),
    status: order.status,
    channel: order.channel || 'marketplace',
    totalPrice: order.totalPrice,
    paymentMethod: order.paymentMethod || 'cod',
    pointsSpent: order.pointsSpent || 0,
    customerName: order.deliveryAddress?.fullName || 'Guest',
    createdAt: order.createdAt,
  })

  return {
    generatedAt: new Date().toISOString(),
    stats: {
      orders: {
        total: sumStatusMap(ordersByStatus),
        byStatus: ordersByStatus,
        pendingAction: pendingOrdersCount,
      },
      designs: {
        total: sumStatusMap(designsByStatus),
        byStatus: designsByStatus,
        pendingReview: designsByStatus.pending_review || 0,
      },
      quotes: {
        total: sumStatusMap(quotesByStatus),
        byStatus: quotesByStatus,
        newCount: quotesByStatus.new || 0,
        inProgress: quotesByStatus.in_progress || 0,
      },
      products: {
        published: publishedProducts,
        draft: draftProducts,
        total: publishedProducts + draftProducts,
      },
      users: {
        clients: clientUsers,
        activeClients,
      },
      revenue: {
        last30d: revenue30d.revenue || 0,
        last30dOrders: revenue30d.orders || 0,
        deliveredAllTime: deliveredRevenue.revenue || 0,
        deliveredOrders: deliveredRevenue.orders || 0,
      },
    },
    activity: monthStarts.map((date) => {
      const key = monthKey(date)
      const row = monthlyByKey.get(key)
      return {
        month: key,
        orders: row?.orders || 0,
        revenue: row?.revenue || 0,
      }
    }),
    attention: {
      orders: attentionOrders.map(formatOrderRow),
      designs: attentionDesigns.map((design) => ({
        id: design._id.toString(),
        title: design.title,
        status: design.status,
        previewUrl: design.zones?.find((z) => z.previewUrl)?.previewUrl || '',
        updatedAt: design.updatedAt,
        createdAt: design.createdAt,
      })),
      quotes: attentionQuotes.map((devis) => ({
        id: devis._id.toString(),
        companyName: devis.company || '',
        contactName: devis.contactName || '',
        status: devis.status,
        productsCount: Array.isArray(devis.products) ? devis.products.length : 0,
        createdAt: devis.createdAt,
      })),
    },
    recentOrders: recentOrders.map(formatOrderRow),
    recentUsers: recentUsers.map((user) => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      isActive: user.isActive !== false,
      createdAt: user.createdAt,
    })),
  }
}
