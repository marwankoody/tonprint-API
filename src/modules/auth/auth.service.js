import bcrypt from 'bcryptjs'
import { User } from './user.model.js'
import { AppError } from '../../utils/AppError.js'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt.js'

const PASSWORD_SALT_ROUNDS = 12
const REFRESH_TOKEN_SALT_ROUNDS = 10

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
    roles: user.roles,
    pointsBalance: user.pointsBalance,
    createdAt: user.createdAt,
  }
}

/**
 * Émet une nouvelle paire access/refresh token et fait tourner (rotate) le
 * refresh token stocké côté serveur (son hash) pour cet utilisateur.
 * @param {{ _id: import('mongoose').Types.ObjectId, roles: string[] }} user
 */
async function issueTokenPair(user) {
  const identity = { id: user._id.toString(), roles: user.roles }
  const accessToken = signAccessToken(identity)
  const refreshToken = signRefreshToken(identity)

  const refreshTokenHash = await bcrypt.hash(refreshToken, REFRESH_TOKEN_SALT_ROUNDS)
  await User.updateOne({ _id: user._id }, { refreshTokenHash })

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
