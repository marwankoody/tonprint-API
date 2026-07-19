import mongoose from 'mongoose'

const { Schema, model } = mongoose

const NOTIFICATION_TYPES = Object.freeze(['order_created', 'order_status_changed'])
const NOTIFICATION_AUDIENCES = Object.freeze(['user', 'admin'])

const notificationMetaSchema = new Schema(
  {
    orderId: { type: String, trim: true },
    status: { type: String, trim: true },
    previousStatus: { type: String, trim: true },
    channel: { type: String, trim: true },
    paymentMethod: { type: String, trim: true },
    totalPrice: { type: Number },
  },
  { _id: false }
)

const notificationSchema = new Schema(
  {
    /** Destinataire (client ou admin individuel). */
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    audience: {
      type: String,
      enum: NOTIFICATION_AUDIENCES,
      required: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    /** Payload minimal pour i18n FE — pas de PII. */
    meta: {
      type: notificationMetaSchema,
      default: () => ({}),
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 })
/** Purge : lues expirées / non lues expirées. */
notificationSchema.index({ readAt: 1, createdAt: 1 })

export const Notification = model('Notification', notificationSchema)
