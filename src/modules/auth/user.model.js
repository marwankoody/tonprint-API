import mongoose from 'mongoose'

const { Schema, model } = mongoose

/** Rôles applicatifs disponibles — voir aussi `middleware/requireRole.js`. */
export const USER_ROLES = ['client', 'admin']

/**
 * Normalise les rôles applicatifs (`admin` | `client`).
 * Mappe encore l’ancien libellé JWT/DB `creator` → `client` (filet de sécurité
 * pour tokens émis avant migration ; la base est migrée au démarrage).
 * @param {string[]} [roles]
 * @returns {string[]}
 */
export function normalizeRoles(roles = []) {
  const cleaned = [
    ...new Set(
      (roles || [])
        .map((role) => (role === 'creator' ? 'client' : role))
        .filter((role) => USER_ROLES.includes(role))
    ),
  ]
  return cleaned.length > 0 ? cleaned : ['client']
}

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
      maxlength: 30,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false,
    },
    roles: {
      type: [String],
      enum: USER_ROLES,
      default: ['client'],
    },
    pointsBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    /** Soft status — false bloque login/refresh et révoque la session. */
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    // Hash bcrypt du refresh token actif — permet la révocation (logout) et la
    // détection de réutilisation (rotation à chaque /auth/refresh).
    refreshTokenHash: {
      type: String,
      default: null,
      select: false,
    },
  },
  { timestamps: true }
)

// `unique: true` ci-dessus crée déjà l'index MongoDB sur `email`.
userSchema.index({ roles: 1, createdAt: -1 })
userSchema.index({ isActive: 1, createdAt: -1 })

export const User = model('User', userSchema)
