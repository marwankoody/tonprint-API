import mongoose from 'mongoose'
import { User } from '../auth/user.model.js'
import { Design } from '../designs/design.model.js'
import { Order } from '../orders/order.model.js'
import { Devis } from '../devis/devis.model.js'
import { PointsLedger } from '../points/pointsLedger.model.js'
import { getPointsSettings } from '../points/pointsSettings.service.js'
import { AppError } from '../../utils/AppError.js'
import { monthKey, buildMonthBuckets } from '../../utils/monthBuckets.js'

const MONTH_WINDOW = 6

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
  const monthStarts = buildMonthBuckets(MONTH_WINDOW)
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
    designIds,
    pointsSettings,
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
    // Uniquement les _id (indexé creator) — les métadonnées du top 5 sont chargées après.
    Design.find({ creator: userId }).select('_id').lean(),
    getPointsSettings(),
  ])

  if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND')

  const designObjectIds = designIds.map((design) => design._id)

  // $facet : top 5 + total TOUTES ventes livrées (la progression palier doit
  // compter tous les designs, pas seulement le top 5).
  const [salesAgg] = designObjectIds.length
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
        {
          $facet: {
            top: [{ $sort: { deliveredQty: -1 } }, { $limit: 5 }],
            totals: [{ $group: { _id: null, deliveredQty: { $sum: '$deliveredQty' } } }],
          },
        },
      ])
    : [{ top: [], totals: [] }]

  const salesRows = salesAgg.top
  const totalDeliveredDesignSales = salesAgg.totals[0]?.deliveredQty || 0

  const topDesignDocs = salesRows.length
    ? await Design.find({ _id: { $in: salesRows.map((row) => row._id) } })
        .select('title status zones.previewUrl')
        .lean()
    : []
  const designById = new Map(topDesignDocs.map((design) => [design._id.toString(), design]))
  const { milestoneSize, pointsPerMilestone } = pointsSettings
  const nextMilestoneRemaining =
    totalDeliveredDesignSales === 0
      ? milestoneSize
      : milestoneSize - (totalDeliveredDesignSales % milestoneSize || milestoneSize)

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
        milestoneSize,
        pointsPerMilestone,
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
