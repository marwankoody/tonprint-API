import rateLimit from 'express-rate-limit'
import { env } from '../config/env.js'

const isDev = env.NODE_ENV === 'development'

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

/**
 * Limiteur global appliqué à toute l'API (garde-fou anti-abus/DoS).
 * Les endpoints sensibles (auth) ont en plus leurs propres limiteurs, plus stricts.
 * Désactivé en dev : HMR + navigation intensive épuisent le quota et
 * bloquent toute l'API (y compris /login) avec des 429.
 */
export const apiLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  limit: 300,
  skip: () => isDev,
})

/**
 * Limiteur dédié aux formulaires publics (devis, contact…) :
 * 5 soumissions / 15 min / IP — compte aussi les succès (anti-spam).
 */
export const devisFormLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: false,
})

/** Alias sémantique — même quota anti-spam que le formulaire devis. */
export const contactFormLimiter = devisFormLimiter

/**
 * Mot de passe oublié / reset : 5 tentatives / 15 min / IP
 * (compte aussi les succès — anti-abus email + brute-force token).
 */
export const passwordResetLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: false,
})

/**
 * Limiteur des uploads de l'éditeur de designs (images importées + exports
 * par zone à l'enregistrement) : protège le quota Cloudinary.
 * Un enregistrement peut compter jusqu'à ~10 requêtes (images + 5 zones).
 */
export const designUploadLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  limit: 60,
})

/**
 * Connexions SSE notifications : limite les reconnects agressifs.
 * Une session longue = 1 requête initiale ; le heartbeat ne recompte pas.
 * Désactivé en dev : StrictMode + HMR + rechargements consomment le quota
 * très vite et provoquent des 429 en boucle.
 */
export const sseStreamLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  limit: 240,
  skip: () => isDev,
})

/**
 * Émission de tickets SSE : même quota que le stream
 * (chaque reconnect nécessite un nouveau ticket).
 */
export const sseTicketLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  limit: 240,
  skip: () => isDev,
})

/**
 * Création de commandes (guest COD inclus) : anti-spam stock / ops.
 */
export const orderCreateLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: false,
})
