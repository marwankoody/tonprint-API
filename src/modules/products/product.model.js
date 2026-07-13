import mongoose from 'mongoose'

const { Schema, model } = mongoose

/** Catégories produits courantes sur TonPrint. */
export const PRODUCT_CATEGORIES = [
  't-shirts',
  'hoodies',
  'caps',
  'tote-bags',
  'mugs',
  'uniforms'
]

const measurementsSchema = new Schema(
  {
    chest: { type: Number, min: 0 },
    length: { type: Number, min: 0 },
    sleeve: { type: Number, min: 0 },
  },
  { _id: false }
)

const variantSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    sku: { type: String, trim: true },
    priceDelta: { type: Number, default: 0 },
    stock: { type: Number, min: 0, default: 0 },
    /** Mensurations (cm) — optionnelles, remplies depuis le dashboard admin pour le tableau de tailles. */
    measurements: { type: measurementsSchema, default: undefined },
  },
  { _id: true }
)

const colorSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    hex: { type: String, required: true, trim: true, match: /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/ },
  },
  { _id: false }
)

const imageSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false }
)

const productSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: 120,
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: PRODUCT_CATEGORIES,
      index: true,
    },
    /** HTML riche (éditeur Lexical côté admin). */
    description: {
      type: String,
      trim: true,
      maxlength: 20000,
      default: '',
    },
    printType: {
      type: String,
      trim: true,
      maxlength: 60,
      default: '',
    },
    variants: {
      type: [variantSchema],
      default: [],
    },
    colors: {
      type: [colorSchema],
      default: [],
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: 0,
      index: true,
    },
    /** Prix barré (avant promo). Si absent, pas de réduction affichée. */
    compareAtPrice: {
      type: Number,
      min: 0,
      default: null,
    },
    /** Prix de gros (quantité ≥ wholesaleMoq). */
    wholesalePrice: {
      type: Number,
      min: 0,
      default: null,
    },
    wholesaleMoq: {
      type: Number,
      min: 1,
      default: 30,
    },
    images: {
      type: [imageSchema],
      default: [],
    },
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    isPublished: {
      type: Boolean,
      default: false,
      index: true,
    },
    isPointsRedeemable: {
      type: Boolean,
      default: false,
    },
    pointsCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Compteur de ventes / popularité — incrémenté plus tard par le module orders.
    popularity: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
)

productSchema.index({ isPublished: 1, category: 1 })
productSchema.index({ isPublished: 1, price: 1 })
productSchema.index({ isPublished: 1, popularity: -1 })

export const Product = model('Product', productSchema)
