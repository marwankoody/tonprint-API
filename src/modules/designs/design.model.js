import mongoose from 'mongoose'
import { PRINT_ZONES } from '../products/product.model.js'

const { Schema, model } = mongoose

export const DESIGN_STATUSES = Object.freeze([
  'draft',
  'pending_review',
  'approved',
  'rejected',
])

/** Variante produit choisie dans l'éditeur (snapshot). */
const designVariantSchema = new Schema(
  {
    colorName: { type: String, trim: true, maxlength: 60, default: '' },
    colorHex: { type: String, trim: true, maxlength: 7, default: '' },
    size: { type: String, trim: true, maxlength: 30, default: '' },
    quality: { type: String, trim: true, maxlength: 20, default: '' },
    printType: { type: String, trim: true, maxlength: 60, default: '' },
  },
  { _id: false }
)

/**
 * Une zone personnalisée du design :
 * - `canvasJson` : sérialisation Fabric (source d'édition, images par URL Cloudinary)
 * - `previewUrl` : mockup produit + design (affichage web)
 * - `printFileUrl` : PNG isolé fond transparent haute résolution (admin/imprimeur uniquement)
 */
const designZoneSchema = new Schema(
  {
    zone: { type: String, required: true, enum: PRINT_ZONES },
    canvasJson: { type: Schema.Types.Mixed, required: true },
    previewUrl: { type: String, default: '' },
    previewPublicId: { type: String, default: '' },
    printFileUrl: { type: String, default: '' },
    printFilePublicId: { type: String, default: '' },
  },
  { _id: false }
)

const designSchema = new Schema(
  {
    creator: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    variant: { type: designVariantSchema, default: () => ({}) },
    zones: {
      type: [designZoneSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 5,
        message: 'A design must have between 1 and 5 zones',
      },
    },
    status: {
      type: String,
      enum: DESIGN_STATUSES,
      default: 'draft',
      index: true,
    },
    /** Autorisation explicite de revente publique (Phase points/marketplace). */
    licenseGrantedByCreator: {
      type: Boolean,
      default: false,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
  },
  { timestamps: true }
)

designSchema.index({ creator: 1, updatedAt: -1 })
designSchema.index({ status: 1, updatedAt: -1 })

export const Design = model('Design', designSchema)
