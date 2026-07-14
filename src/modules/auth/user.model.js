import mongoose from 'mongoose'

const { Schema, model } = mongoose

/** Rôles applicatifs disponibles — voir aussi `middleware/requireRole.js`. */
export const USER_ROLES = ['client', 'creator', 'admin']

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

export const User = model('User', userSchema)
