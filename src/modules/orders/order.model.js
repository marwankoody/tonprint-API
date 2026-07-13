import mongoose from 'mongoose'

const { Schema, model } = mongoose

/** Statuts de commande COD TonPrint. */
export const ORDER_STATUSES = Object.freeze([
  'pending_delivery',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
])

/** Transitions de statut autorisées (admin). */
export const ORDER_STATUS_TRANSITIONS = Object.freeze({
  pending_delivery: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
})

const variantSnapshotSchema = new Schema(
  {
    label: { type: String, trim: true },
    sku: { type: String, trim: true },
    color: { type: String, trim: true },
  },
  { _id: false }
)

const orderItemSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    /** Réservé Phase 5 — design personnalisé (pas de validation Design pour l'instant). */
    design: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    name: { type: String, required: true, trim: true },
    image: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    /** Prix unitaire recalculé côté serveur (snapshot). */
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    variant: { type: variantSnapshotSchema, default: undefined },
  },
  { _id: true }
)

const deliveryAddressSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    address: { type: String, required: true, trim: true, maxlength: 250 },
    postalCode: { type: String, trim: true, maxlength: 20, default: '' },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { _id: false }
)

const statusHistorySchema = new Schema(
  {
    from: { type: String, enum: ORDER_STATUSES },
    to: { type: String, required: true, enum: ORDER_STATUSES },
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
)

const orderSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    items: {
      type: [orderItemSchema],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: 'Order must have at least one item',
      },
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: 'pending_delivery',
      index: true,
    },
    deliveryAddress: {
      type: deliveryAddressSchema,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ['cod'],
      default: 'cod',
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },
  },
  { timestamps: true }
)

orderSchema.index({ user: 1, createdAt: -1 })
orderSchema.index({ createdAt: -1 })
orderSchema.index({ status: 1, createdAt: -1 })

export const Order = model('Order', orderSchema)
