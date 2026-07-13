import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { AppError } from '../utils/AppError.js'
import { asyncHandler } from './errorHandler.js'

/**
 * Middleware d'authentification JWT.
 * Lit le Bearer token dans `Authorization`, vérifie la signature,
 * et attache `req.user = { id, roles }`.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization

  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED')
  }

  const token = header.slice(7)

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET)
    req.user = {
      id: payload.sub,
      roles: payload.roles || [],
    }
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError('Access token expired', 401, 'TOKEN_EXPIRED')
    }
    throw new AppError('Invalid access token', 401, 'INVALID_TOKEN')
  }
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

  const token = header.slice(7)

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET)
    req.user = {
      id: payload.sub,
      roles: payload.roles || [],
    }
  } catch {
    // Token invalide/expiré → on continue anonymement
  }

  next()
})
