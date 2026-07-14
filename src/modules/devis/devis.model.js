import mongoose from 'mongoose'

const { Schema, model } = mongoose

export const DEVIS_PRODUCTS = Object.freeze([
  'tshirts',
  'hoodies',
  'caps',
  'tote_bags',
  'mugs',
  'bottles',
  'posters',
  'stickers',
  'uniforms',
  'other',
])

export const DEVIS_QUANTITIES = Object.freeze(['lt_50', '50_200', '200_500', 'gt_500'])

export const DEVIS_DEADLINES = Object.freeze(['urgent', '1_2_weeks', '2_4_weeks', 'flexible'])

export const DEVIS_STATUSES = Object.freeze(['new', 'in_progress', 'quoted', 'closed'])

/** Transitions de statut autorisées (admin). */
export const DEVIS_STATUS_TRANSITIONS = Object.freeze({
  new: ['in_progress', 'closed'],
  in_progress: ['quoted', 'closed'],
  quoted: ['closed', 'in_progress'],
  closed: [],
})

const statusHistorySchema = new Schema(
  {
    from: { type: String, enum: DEVIS_STATUSES },
    to: { type: String, required: true, enum: DEVIS_STATUSES },
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
)

const devisSchema = new Schema(
  {
    company: { type: String, required: true, trim: true, maxlength: 120 },
    contactName: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 180 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    products: {
      type: [{ type: String, enum: DEVIS_PRODUCTS }],
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 10,
        message: 'Select between 1 and 10 products',
      },
    },
    quantity: { type: String, required: true, enum: DEVIS_QUANTITIES },
    deadline: { type: String, enum: DEVIS_DEADLINES, default: null },
    details: { type: String, required: true, trim: true, maxlength: 3000 },
    status: {
      type: String,
      enum: DEVIS_STATUSES,
      default: 'new',
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },
  },
  { timestamps: true }
)

devisSchema.index({ status: 1, createdAt: -1 })
devisSchema.index({ email: 1, createdAt: -1 })
devisSchema.index({ createdAt: -1 })

export const Devis = model('Devis', devisSchema)
