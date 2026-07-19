import mongoose from 'mongoose'

const { Schema, model } = mongoose

const LEDGER_TYPES = Object.freeze(['credit', 'debit'])

/**
 * Livre de compte des points — source de vérité des mouvements.
 * `User.pointsBalance` est un cache mis à jour atomiquement avec chaque écriture.
 *
 * `idempotencyKey` unique empêche les doubles crédits (ex. double passage à delivered).
 */
const pointsLedgerSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: LEDGER_TYPES,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    /** Solde après cette opération (audit). */
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    relatedDesign: {
      type: Schema.Types.ObjectId,
      ref: 'Design',
      default: null,
    },
    relatedOrder: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    relatedProduct: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },
    /** Clé unique anti-doublon (ex. milestone:{designId}:10). */
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

pointsLedgerSchema.index({ idempotencyKey: 1 }, { unique: true })
pointsLedgerSchema.index({ user: 1, createdAt: -1 })

export const PointsLedger = model('PointsLedger', pointsLedgerSchema)
