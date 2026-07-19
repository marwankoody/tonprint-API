import { env } from './env.js'

/**
 * Options du cookie httpOnly contenant le refresh token.
 *
 * CSRF : pas de token CSRF dédié. Mitigation = (1) access JWT en Bearer/mémoire
 * (pas cookie), (2) refresh cookie `sameSite=strict` + `path=/api/auth` seulement,
 * (3) CORS whitelist + credentials. Les mutations métier hors /auth passent par Bearer.
 *
 * En production (domaine tonprint.ma), le cookie est `secure`, `sameSite=strict`
 * et posé sur `COOKIE_DOMAIN` (ex: ".tonprint.ma") pour rester valide sur
 * www.tonprint.ma et tonprint.ma. En dev, `secure` est désactivé (pas de HTTPS local).
 *
 * @param {{ maxAgeMs?: number }} [options]
 * @returns {import('express').CookieOptions}
 */
export function getRefreshCookieOptions(options = {}) {
  const isProd = env.NODE_ENV === 'production'

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: '/api/auth',
    ...(isProd && env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
    ...(options.maxAgeMs ? { maxAge: options.maxAgeMs } : {}),
  }
}

/** Nom du cookie de refresh token. */
export const REFRESH_COOKIE_NAME = 'tonprint_refresh_token'
