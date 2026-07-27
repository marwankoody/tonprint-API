import { AppError } from '../utils/AppError.js'
import { asyncHandler } from './errorHandler.js'
import { verifyAccessToken } from '../utils/jwt.js'
import { User, normalizeRoles } from '../modules/auth/user.model.js'

/**
 * Vérifie le JWT access puis recharge isActive + rôles depuis la DB
 * (compte désactivé / rôles changés pris en compte immédiatement).
 * @param {string} token
 * @returns {Promise<{ id: string, roles: string[] }>}
 */
export async function resolveAccessUser(token) {
  let payload
  try {
    payload = verifyAccessToken(token)
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError('Access token expired', 401, 'TOKEN_EXPIRED')
    }
    throw new AppError('Invalid access token', 401, 'INVALID_TOKEN')
  }

  const user = await User.findById(payload.sub).select('roles isActive').lean()
  if (!user || user.isActive === false) {
    throw new AppError('This account has been disabled', 401, 'ACCOUNT_DISABLED')
  }

  return {
    id: user._id.toString(),
    roles: normalizeRoles(user.roles),
  }
}

/**
 * Middleware d'authentification JWT.
 * Lit le Bearer token dans `Authorization`, vérifie la signature,
 * et attache `req.user = { id, roles }` (rôles frais depuis la DB).
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization

  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED')
  }

  req.user = await resolveAccessUser(header.slice(7))
  next()
})

/**
 * Authentification optionnelle : attache `req.user` si un token valide
 * est présent, sinon continue sans erreur.
 */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization

  if (!header || !header.startsWith('Bearer ')) {
    return next()
  }

  try {
    req.user = await resolveAccessUser(header.slice(7))
  } catch {
    // Token invalide/expiré/compte désactivé → on continue anonymement
  }

  next()
})
