import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

// Pin explicite de l'algorithme (RFC 8725) + claim `typ` pour empêcher
// qu'un refresh token soit accepté comme access token (et inversement).
const JWT_ALGORITHM = 'HS256'

/**
 * Génère un access token JWT courte durée.
 * @param {{ id: string, roles: string[] }} user
 * @returns {string}
 */
export function signAccessToken(user) {
  return jwt.sign(
    { roles: user.roles, typ: 'access' },
    env.JWT_ACCESS_SECRET,
    {
      algorithm: JWT_ALGORITHM,
      subject: String(user.id),
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    }
  )
}

/**
 * Génère un refresh token JWT longue durée.
 * @param {{ id: string }} user
 * @returns {string}
 */
export function signRefreshToken(user) {
  return jwt.sign({ typ: 'refresh' }, env.JWT_REFRESH_SECRET, {
    algorithm: JWT_ALGORITHM,
    subject: String(user.id),
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  })
}

/**
 * Vérifie et décode un access token. Lance si signature/typ invalide.
 * @param {string} token
 * @returns {{ sub: string, roles?: string[] }}
 */
export function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: [JWT_ALGORITHM] })
  if (payload.typ !== 'access') {
    throw new jwt.JsonWebTokenError('Invalid token type')
  }
  return payload
}

/**
 * Vérifie et décode un refresh token.
 * @param {string} token
 * @returns {{ sub: string }}
 */
export function verifyRefreshToken(token) {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: [JWT_ALGORITHM] })
  if (payload.typ !== 'refresh') {
    throw new jwt.JsonWebTokenError('Invalid token type')
  }
  return payload
}
