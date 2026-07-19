import mongoose from 'mongoose'

const { Schema, model } = mongoose

/** Catégories produits courantes sur TonPrint. */
export const PRODUCT_CATEGORIES = [
  't-shirts',
  'hoodies',
  'caps',
  'tote-bags',
  'mugs',
  'uniforms',
]

/**
 * Canal de distribution :
 * - `marketplace` → boutique publique `/marketplace`
 * - `personalization` → catalogue créateur `/creator/catalog`
 */
export const PRODUCT_CHANNELS = ['marketplace', 'personalization']

/** Zones d'impression personnalisables (éditeur de design). */
export const PRINT_ZONES = ['front', 'back', 'neck', 'sleeve_left', 'sleeve_right']

/** Qualités produit (chacune avec son propre prix). */
export const PRODUCT_QUALITY_KEYS = ['normal', 'premium', 'oversize']

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

/** Qualité vendable : clé fixe + prix absolu (remplace le prix de base si sélectionnée). */
const qualitySchema = new Schema(
  {
    key: { type: String, required: true, enum: PRODUCT_QUALITY_KEYS },
    price: { type: Number, required: true, min: 0 },
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

/** Mockup d'une zone d'impression, par couleur de produit. */
const printAreaMockupSchema = new Schema(
  {
    colorName: { type: String, required: true, trim: true, maxlength: 60 },
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false }
)

/**
 * Zone d'impression configurée par l'admin pour l'éditeur de personnalisation :
 * - `rectPx` : rectangle imprimable en pixels sur l'image mockup (source de vérité pour le clip canvas)
 * - `sizeCm` : dimensions réelles imprimables — sert au calcul DPI et à l'export 300 DPI
 */
const printAreaSchema = new Schema(
  {
    zone: { type: String, required: true, enum: PRINT_ZONES },
    mockups: { type: [printAreaMockupSchema], default: [] },
    rectPx: {
      x: { type: Number, required: true, min: 0 },
      y: { type: Number, required: true, min: 0 },
      w: { type: Number, required: true, min: 1 },
      h: { type: Number, required: true, min: 1 },
    },
    sizeCm: {
      w: { type: Number, required: true, min: 0.1 },
      h: { type: Number, required: true, min: 0.1 },
    },
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
    channel: {
      type: String,
      required: [true, 'Channel is required'],
      enum: PRODUCT_CHANNELS,
      default: 'marketplace',
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
    /** Types d'impression proposés dans l'éditeur de personnalisation (ex. DTF, Broderie). */
    printTypes: {
      type: [{ type: String, trim: true, maxlength: 60 }],
      default: [],
    },
    variants: {
      type: [variantSchema],
      default: [],
    },
    /** Zones d'impression pour l'éditeur (produits `channel=personalization`). */
    printAreas: {
      type: [printAreaSchema],
      default: [],
    },
    colors: {
      type: [colorSchema],
      default: [],
    },
    /** Qualités proposées (normal / premium / oversize) avec prix dédié. */
    qualities: {
      type: [qualitySchema],
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
    /**
     * Design créateur à l'origine de ce produit marketplace.
     * Toutes les ventes livrées de produits liés au même design comptent pour les paliers.
     */
    sourceDesign: {
      type: Schema.Types.ObjectId,
      ref: 'Design',
      default: null,
      index: true,
    },
    /** Créateur récompensé (dénormalisé depuis Design.creator). */
    creator: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
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

productSchema.index({ isPublished: 1, channel: 1, category: 1 })
productSchema.index({ isPublished: 1, channel: 1, createdAt: -1 })
productSchema.index({ isPublished: 1, channel: 1, popularity: -1 })
productSchema.index({ isPublished: 1, category: 1 })
productSchema.index({ isPublished: 1, price: 1 })
productSchema.index({ isPublished: 1, popularity: -1 })
productSchema.index({ isPublished: 1, isPointsRedeemable: 1 })
productSchema.index({ sourceDesign: 1, isPublished: 1 })
/** Recherche catalogue : utilise `$text` (voir product.service list*). explain() en staging pour vérifier. */
productSchema.index({ name: 'text' })

export const Product = model('Product', productSchema)
