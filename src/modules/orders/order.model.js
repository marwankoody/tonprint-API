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

/**
 * Canal de la commande (snapshot à la création) :
 * - marketplace → produits boutique uniquement
 * - personalization → designs personnalisés uniquement
 * - mixed → panier combiné boutique + personnalisation
 */
export const ORDER_CHANNELS = Object.freeze(['marketplace', 'personalization', 'mixed'])

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
    quality: { type: String, trim: true },
  },
  { _id: false }
)

const designZoneSnapshotSchema = new Schema(
  {
    zone: { type: String, required: true, trim: true },
    previewUrl: { type: String, default: '' },
    printFileUrl: { type: String, default: '' },
  },
  { _id: false }
)

const designSnapshotSchema = new Schema(
  {
    title: { type: String, trim: true, default: '' },
    zones: { type: [designZoneSnapshotSchema], default: [] },
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
    design: {
      type: Schema.Types.ObjectId,
      ref: 'Design',
      default: null,
    },
    /**
     * Snapshot du design marketplace lié au produit (ventes → paliers de points).
     * Copié depuis Product.sourceDesign à la création — évite un $lookup à chaque crédit.
     */
    sourceDesign: {
      type: Schema.Types.ObjectId,
      ref: 'Design',
      default: null,
      index: true,
    },
    /** Snapshot figé au moment de la commande pour l'atelier d'impression. */
    designSnapshot: { type: designSnapshotSchema, default: null },
    name: { type: String, required: true, trim: true },
    image: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    /** Prix unitaire recalculé côté serveur (snapshot MAD). */
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    /** Coût en points (échange points) — 0 si paiement COD. */
    unitPoints: { type: Number, default: 0, min: 0 },
    linePoints: { type: Number, default: 0, min: 0 },
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
    /** Présent si commande compte connecté ; null = commande invité (COD). */
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    /**
     * Secret one-time-ish pour que l'invité retrouve sa confirmation
     * sans compte (header X-Guest-Token). Jamais exposé en liste admin brute.
     */
    // Accès toujours par _id puis comparaison timing-safe — pas d'index nécessaire.
    guestAccessToken: {
      type: String,
      default: null,
      select: false,
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
    /** Total points débités (snapshot) — 0 pour COD. */
    pointsSpent: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: 'pending_delivery',
      index: true,
    },
    channel: {
      type: String,
      enum: ORDER_CHANNELS,
      default: 'marketplace',
      index: true,
    },
    deliveryAddress: {
      type: deliveryAddressSchema,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ['cod', 'points'],
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
orderSchema.index({ user: 1, channel: 1, createdAt: -1 })
orderSchema.index({ user: 1, status: 1, createdAt: -1 })
orderSchema.index({ channel: 1, createdAt: -1 })
orderSchema.index({ channel: 1, status: 1, createdAt: -1 })
orderSchema.index({ createdAt: -1 })
orderSchema.index({ status: 1, createdAt: -1 })
/** Agrégats paliers points : ventes livrées par design marketplace. */
orderSchema.index({ status: 1, 'items.sourceDesign': 1 })

export const Order = model('Order', orderSchema)
