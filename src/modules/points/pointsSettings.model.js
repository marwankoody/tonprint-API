import mongoose from 'mongoose'
import { MILESTONE_SIZE, POINTS_PER_MILESTONE } from './points.constants.js'

const { Schema, model } = mongoose

/** Singleton — une seule ligne de config pour le programme de points. */
export const POINTS_SETTINGS_KEY = 'default'

/**
 * Paramètres admin du programme de fidélité.
 * En l'absence de document, les constantes `points.constants.js` font foi.
 */
const pointsSettingsSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: POINTS_SETTINGS_KEY,
      trim: true,
    },
    /** Nombre de ventes livrées par palier (ex. 10 → paliers 10, 20, 30…). */
    milestoneSize: {
      type: Number,
      required: true,
      min: 1,
      max: 10_000,
      default: MILESTONE_SIZE,
    },
    /** Points crédités à chaque palier atteint. */
    pointsPerMilestone: {
      type: Number,
      required: true,
      min: 1,
      max: 1_000_000,
      default: POINTS_PER_MILESTONE,
    },
  },
  { timestamps: true }
)

export const PointsSettings = model('PointsSettings', pointsSettingsSchema)
