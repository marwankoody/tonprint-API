import mongoose from 'mongoose'
import { User } from '../auth/user.model.js'
import { Design } from '../designs/design.model.js'
import { Order } from '../orders/order.model.js'
import { Devis } from '../devis/devis.model.js'
import { PointsLedger } from '../points/pointsLedger.model.js'
import { MILESTONE_SIZE } from '../points/points.constants.js'
import { AppError } from '../../utils/AppError.js'

const MONTH_WINDOW = 6

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function buildMonthBuckets() {
  const now = new Date()
  const buckets = []
  for (let offset = MONTH_WINDOW - 1; offset >= 0; offset--) {
    buckets.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1)))
  }
  return buckets
}

function firstPreviewUrl(design) {
  return design.zones?.find((zone) => zone.previewUrl)?.previewUrl || ''
}

function countByStatus(rows) {
  return rows.reduce((acc, row) => {
    acc[row._id || 'unknown'] = row.count
    return acc
  }, {})
}

/**
 * Dashboard créateur en une seule réponse API pour éviter un waterfall côté React.
 * Agrégations bornées + indexes existants (`creator`, `user`, `createdAt`, `sourceDesign`).
 *
 * @param {string} userId
 */
export async function getCreatorDashboard(userId) {
  if (!mongoose.isValidObjectId(userId)) {
    throw new AppError('Invalid user id', 400, 'INVALID_ID')
  }

  const userObjectId = new mongoose.Types.ObjectId(userId)
  const monthStarts = buildMonthBuckets()
  const activityStart = monthStarts[0]

  const [
    user,
    designStatusRows,
    orderStatusRows,
    quoteStatusRows,
    recentDesignDocs,
    recentOrderDocs,
    recentLedgerDocs,
    monthlyRows,
  ] = await Promise.all([
    User.findById(userId).select('name pointsBalance createdAt').lean(),
    Design.aggregate([
      { $match: { creator: userObjectId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { user: userObjectId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Devis.aggregate([
      { $match: { user: userObjectId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Design.find({ creator: userId })
      .sort({ updatedAt: -1 })
      .limit(4)
      .select('title status zones.previewUrl updatedAt createdAt')
      .lean(),
    Order.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('status channel totalPrice paymentMethod pointsSpent createdAt items.quantity')
      .lean(),
    PointsLedger.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('type amount reason createdAt')
      .lean(),
    Order.aggregate([
      { $match: { user: userObjectId, createdAt: { $gte: activityStart } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          orders: { $sum: 1 },
          revenue: { $sum: '$totalPrice' },
          pointsSpent: { $sum: '$pointsSpent' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ])

  if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND')

  const designIds = await Design.find({ creator: userId }).select('_id title status zones.previewUrl').lean()
  const designObjectIds = designIds.map((design) => design._id)

  const salesRows = designObjectIds.length
    ? await Order.aggregate([
        { $match: { status: 'delivered', 'items.sourceDesign': { $in: designObjectIds } } },
        { $unwind: '$items' },
        { $match: { 'items.sourceDesign': { $in: designObjectIds } } },
        {
          $group: {
            _id: '$items.sourceDesign',
            deliveredQty: { $sum: '$items.quantity' },
            revenue: { $sum: '$items.lineTotal' },
          },
        },
        { $sort: { deliveredQty: -1 } },
        { $limit: 5 },
      ])
    : []

  const designById = new Map(designIds.map((design) => [design._id.toString(), design]))
  const totalDeliveredDesignSales = salesRows.reduce((sum, row) => sum + row.deliveredQty, 0)
  const nextMilestoneRemaining =
    totalDeliveredDesignSales === 0
      ? MILESTONE_SIZE
      : MILESTONE_SIZE - (totalDeliveredDesignSales % MILESTONE_SIZE || MILESTONE_SIZE)

  const monthlyByKey = new Map(monthlyRows.map((row) => [row._id, row]))

  return {
    profile: {
      name: user.name,
      memberSince: user.createdAt,
    },
    stats: {
      pointsBalance: user.pointsBalance || 0,
      designs: {
        total: designStatusRows.reduce((sum, row) => sum + row.count, 0),
        byStatus: countByStatus(designStatusRows),
      },
      orders: {
        total: orderStatusRows.reduce((sum, row) => sum + row.count, 0),
        byStatus: countByStatus(orderStatusRows),
      },
      quotes: {
        total: quoteStatusRows.reduce((sum, row) => sum + row.count, 0),
        byStatus: countByStatus(quoteStatusRows),
      },
      marketplaceSales: {
        deliveredQty: totalDeliveredDesignSales,
        nextMilestoneRemaining,
      },
    },
    activity: monthStarts.map((date) => {
      const key = monthKey(date)
      const row = monthlyByKey.get(key)
      return {
        month: key,
        orders: row?.orders || 0,
        revenue: row?.revenue || 0,
        pointsSpent: row?.pointsSpent || 0,
      }
    }),
    topDesigns: salesRows.map((row) => {
      const design = designById.get(row._id.toString())
      return {
        id: row._id.toString(),
        title: design?.title || 'Design',
        status: design?.status || 'draft',
        previewUrl: design ? firstPreviewUrl(design) : '',
        deliveredQty: row.deliveredQty,
        revenue: row.revenue,
      }
    }),
    recentDesigns: recentDesignDocs.map((design) => ({
      id: design._id.toString(),
      title: design.title,
      status: design.status,
      previewUrl: firstPreviewUrl(design),
      updatedAt: design.updatedAt,
      createdAt: design.createdAt,
    })),
    recentOrders: recentOrderDocs.map((order) => ({
      id: order._id.toString(),
      status: order.status,
      channel: order.channel || 'marketplace',
      totalPrice: order.totalPrice,
      paymentMethod: order.paymentMethod || 'cod',
      pointsSpent: order.pointsSpent || 0,
      itemsCount: (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0),
      createdAt: order.createdAt,
    })),
    recentPoints: recentLedgerDocs.map((entry) => ({
      id: entry._id.toString(),
      type: entry.type,
      amount: entry.amount,
      reason: entry.reason,
      createdAt: entry.createdAt,
    })),
  }
}
