import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

/**
 * Génère un access token JWT courte durée.
 * @param {{ id: string, roles: string[] }} user
 * @returns {string}
 */
export function signAccessToken(user) {
  return jwt.sign(
    { roles: user.roles },
    env.JWT_ACCESS_SECRET,
    {
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
  return jwt.sign({}, env.JWT_REFRESH_SECRET, {
    subject: String(user.id),
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  })
}

/**
 * Vérifie et décode un refresh token.
 * @param {string} token
 * @returns {{ sub: string }}
 */
export function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET)
}
