import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { User, normalizeRoles } from './user.model.js'
import { AppError } from '../../utils/AppError.js'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt.js'
import { env } from '../../config/env.js'
import { sendMail } from '../../lib/mail/mail.client.js'
import { passwordResetEmail } from '../../lib/mail/mail.templates.js'

const PASSWORD_SALT_ROUNDS = 12
const REFRESH_TOKEN_SALT_ROUNDS = 10
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000

/**
 * @param {string} rawToken
 */
function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

// Hash bcrypt d'une valeur factice, comparé quand l'email n'existe pas, pour que
// le login prenne le même temps que l'email existe ou non (anti user-enumeration
// par mesure du temps de réponse).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('timing-attack-mitigation', PASSWORD_SALT_ROUNDS)

/**
 * Ne renvoie jamais `password` ni `refreshTokenHash` au client.
 * @param {import('mongoose').Document | object} user
 */
function sanitizeUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    city: user.city || '',
    address: user.address || '',
    postalCode: user.postalCode || '',
    roles: normalizeRoles(user.roles),
    pointsBalance: user.pointsBalance,
    isActive: user.isActive !== false,
    createdAt: user.createdAt,
  }
}

/**
 * Émet une nouvelle paire access/refresh token et fait tourner (rotate) le
 * refresh token stocké côté serveur (son hash) pour cet utilisateur.
 * @param {{ _id: import('mongoose').Types.ObjectId, roles: string[] }} user
 */
async function issueTokenPair(user) {
  const roles = normalizeRoles(user.roles)
  const identity = { id: user._id.toString(), roles }
  const accessToken = signAccessToken(identity)
  const refreshToken = signRefreshToken(identity)

  const refreshTokenHash = await bcrypt.hash(refreshToken, REFRESH_TOKEN_SALT_ROUNDS)
  // Persiste aussi la normalisation des rôles (admin | client uniquement).
  await User.updateOne({ _id: user._id }, { refreshTokenHash, roles })

  return { accessToken, refreshToken }
}

/**
 * @param {{ name: string, email: string, password: string }} input
 */
export async function register({ name, email, password }) {
  const alreadyExists = await User.exists({ email })
  if (alreadyExists) {
    throw new AppError('An account with this email already exists', 409, 'EMAIL_TAKEN')
  }

  const hashedPassword = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS)
  const user = await User.create({ name, email, password: hashedPassword })

  const tokens = await issueTokenPair(user)
  return { user: sanitizeUser(user), ...tokens }
}

/**
 * @param {{ email: string, password: string }} input
 */
export async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+password')

  // Message et temps de réponse volontairement identiques que l'email existe ou non,
  // pour ne pas révéler quels comptes existent (énumération de comptes).
  const passwordMatches = await bcrypt.compare(password, user?.password || DUMMY_PASSWORD_HASH)

  if (!user || !passwordMatches) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS')
  }

  if (user.isActive === false) {
    throw new AppError('This account has been disabled', 401, 'ACCOUNT_DISABLED')
  }

  const tokens = await issueTokenPair(user)
  return { user: sanitizeUser(user), ...tokens }
}

/**
 * Renouvelle la paire de tokens à partir d'un refresh token valide.
 * Applique une rotation : l'ancien refresh token devient inutilisable.
 * @param {string | undefined} refreshToken
 */
export async function refresh(refreshToken) {
  if (!refreshToken) {
    throw new AppError('Refresh token missing', 401, 'NO_REFRESH_TOKEN')
  }

  let payload
  try {
    payload = verifyRefreshToken(refreshToken)
  } catch {
    throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN')
  }

  const user = await User.findById(payload.sub).select('+refreshTokenHash')

  if (!user || !user.refreshTokenHash) {
    throw new AppError('Session expired, please log in again', 401, 'SESSION_REVOKED')
  }

  if (user.isActive === false) {
    await User.updateOne({ _id: user._id }, { refreshTokenHash: null })
    throw new AppError('This account has been disabled', 401, 'ACCOUNT_DISABLED')
  }

  const tokenMatchesStoredHash = await bcrypt.compare(refreshToken, user.refreshTokenHash)

  if (!tokenMatchesStoredHash) {
    // Le token présenté ne correspond pas au dernier émis : possible réutilisation
    // d'un token révoqué (vol/replay). On révoque la session par précaution.
    await User.updateOne({ _id: user._id }, { refreshTokenHash: null })
    throw new AppError('Session expired, please log in again', 401, 'SESSION_REVOKED')
  }

  const tokens = await issueTokenPair(user)
  return { user: sanitizeUser(user), ...tokens }
}

/**
 * Révoque le refresh token actif de l'utilisateur (déconnexion côté serveur).
 * @param {string} userId
 */
export async function logout(userId) {
  await User.updateOne({ _id: userId }, { refreshTokenHash: null })
}

/**
 * @param {string} userId
 */
export async function getMe(userId) {
  const user = await User.findById(userId).lean()

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND')
  }

  return sanitizeUser(user)
}

/**
 * @param {string} userId
 * @param {{ name: string, email: string, phone?: string, city?: string, address?: string, postalCode?: string }} input
 */
export async function updateProfile(
  userId,
  { name, email, phone = '', city = '', address = '', postalCode = '' }
) {
  const emailTaken = await User.exists({ email, _id: { $ne: userId } })
  if (emailTaken) {
    throw new AppError('An account with this email already exists', 409, 'EMAIL_TAKEN')
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { name, email, phone, city, address, postalCode } },
    { returnDocument: 'after', runValidators: true }
  ).lean()

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND')
  }

  return sanitizeUser(user)
}

/**
 * @param {string} userId
 * @param {{ currentPassword: string, newPassword: string }} input
 */
export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+password')

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND')
  }

  const matches = await bcrypt.compare(currentPassword, user.password)
  if (!matches) {
    throw new AppError('Current password is incorrect', 400, 'INVALID_CURRENT_PASSWORD')
  }

  user.password = await bcrypt.hash(newPassword, PASSWORD_SALT_ROUNDS)
  // Force re-login elsewhere: revoke refresh sessions after password change.
  user.refreshTokenHash = null
  await user.save()

  return true
}

/**
 * Demande de reset — réponse toujours générique (anti-énumération).
 * Email envoyé en fire-and-forget si le compte existe et est actif.
 * @param {string} email
 */
export async function requestPasswordReset(email) {
  const normalized = String(email || '').trim().toLowerCase()
  const user = await User.findOne({ email: normalized }).select(
    '+passwordResetTokenHash +passwordResetExpires'
  )

  if (!user || user.isActive === false) {
    console.info('[mail] password reset skipped (no active user for email)')
    return
  }

  const rawToken = crypto.randomBytes(32).toString('hex')
  user.passwordResetTokenHash = hashResetToken(rawToken)
  user.passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_TTL_MS)
  await user.save()

  const resetUrl = `${env.FRONTEND_URL.replace(/\/$/, '')}/reset-password?token=${rawToken}`
  const { subject, html, text } = passwordResetEmail({ name: user.name, resetUrl })

  console.info('[mail] password reset queued', {
    to: user.email,
    frontendHost: (() => {
      try {
        return new URL(env.FRONTEND_URL).host
      } catch {
        return 'invalid'
      }
    })(),
  })

  void sendMail({
    to: user.email,
    subject,
    html,
    text,
    debugPayload:
      env.NODE_ENV !== 'production' ? { resetUrl } : undefined,
  }).catch((err) => {
    console.error('[mail] password reset send failed:', err?.message || err)
  })
}

/**
 * @param {{ token: string, newPassword: string }} input
 */
export async function resetPassword({ token, newPassword }) {
  const tokenHash = hashResetToken(token)
  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpires: { $gt: new Date() },
  }).select('+password +passwordResetTokenHash +passwordResetExpires +refreshTokenHash')

  if (!user || user.isActive === false) {
    throw new AppError('Invalid or expired reset token', 400, 'INVALID_RESET_TOKEN')
  }

  user.password = await bcrypt.hash(newPassword, PASSWORD_SALT_ROUNDS)
  user.passwordResetTokenHash = null
  user.passwordResetExpires = null
  user.refreshTokenHash = null
  await user.save()

  return user._id.toString()
}
