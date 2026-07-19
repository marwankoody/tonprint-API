import { PointsSettings, POINTS_SETTINGS_KEY } from './pointsSettings.model.js'
import { MILESTONE_SIZE, POINTS_PER_MILESTONE } from './points.constants.js'
import { AppError } from '../../utils/AppError.js'

/**
 * @param {object} [doc]
 * @returns {{ milestoneSize: number, pointsPerMilestone: number, updatedAt: string|null }}
 */
function formatSettings(doc) {
  return {
    milestoneSize: doc?.milestoneSize ?? MILESTONE_SIZE,
    pointsPerMilestone: doc?.pointsPerMilestone ?? POINTS_PER_MILESTONE,
    updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  }
}

// Cache mémoire court : la config change rarement mais est lue à chaque
// balance / dashboard / palier. Invalidé immédiatement sur update admin.
const CACHE_TTL_MS = 60_000
let cachedSettings = null
let cachedAt = 0

/**
 * Lit la config (lecture seule + cache TTL — plus d'upsert à chaque lecture).
 * @returns {Promise<{ milestoneSize: number, pointsPerMilestone: number, updatedAt: string|null }>}
 */
export async function getPointsSettings() {
  if (cachedSettings && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedSettings
  }

  const doc = await PointsSettings.findOne({ key: POINTS_SETTINGS_KEY }).lean()
  cachedSettings = formatSettings(doc)
  cachedAt = Date.now()
  return cachedSettings
}

/**
 * Met à jour les paliers (admin).
 * @param {{ milestoneSize: number, pointsPerMilestone: number }} payload
 */
export async function updatePointsSettings(payload) {
  const milestoneSize = Number(payload.milestoneSize)
  const pointsPerMilestone = Number(payload.pointsPerMilestone)

  if (!Number.isInteger(milestoneSize) || milestoneSize < 1 || milestoneSize > 10_000) {
    throw new AppError('Invalid milestone size', 400, 'INVALID_MILESTONE_SIZE')
  }
  if (
    !Number.isInteger(pointsPerMilestone) ||
    pointsPerMilestone < 1 ||
    pointsPerMilestone > 1_000_000
  ) {
    throw new AppError('Invalid points per milestone', 400, 'INVALID_POINTS_PER_MILESTONE')
  }

  const doc = await PointsSettings.findOneAndUpdate(
    { key: POINTS_SETTINGS_KEY },
    {
      $set: { milestoneSize, pointsPerMilestone },
      $setOnInsert: { key: POINTS_SETTINGS_KEY },
    },
    { upsert: true, new: true }
  ).lean()

  cachedSettings = formatSettings(doc)
  cachedAt = Date.now()
  return cachedSettings
}
