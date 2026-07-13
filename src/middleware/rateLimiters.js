import rateLimit from 'express-rate-limit'

const commonOptions = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later',
    code: 'RATE_LIMITED',
  },
}

/**
 * Limiteur strict pour les endpoints sensibles au brute force
 * (login, register) : 10 tentatives / 15 min par IP.
 */
export const authLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  // Ne compte pas les connexions/inscriptions réussies : seuls les échecs
  // (mauvais mot de passe, validation) consomment le quota.
  skipSuccessfulRequests: true,
})

/**
 * Limiteur souple pour /auth/refresh : appelé légitimement à chaque
 * chargement de page + à chaque expiration d'access token.
 */
export const refreshLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  limit: 100,
})
