import { AppError } from '../utils/AppError.js'
import { asyncHandler } from './errorHandler.js'
import { verifyAccessToken } from '../utils/jwt.js'
import { normalizeRoles } from '../modules/auth/user.model.js'
import { consumeSseTicket } from '../modules/notifications/sseTicket.store.js'

/**
 * Auth pour SSE : EventSource ne permet pas d'headers custom.
 * Accepte `Authorization: Bearer` **ou** `?ticket=` (one-shot, TTL court).
 * Ne loggue jamais le ticket (morgan masque la query).
 */
export const authenticateSse = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7)
    try {
      const payload = verifyAccessToken(token)
      req.user = {
        id: payload.sub,
        roles: normalizeRoles(payload.roles || []),
      }
      return next()
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new AppError('Access token expired', 401, 'TOKEN_EXPIRED')
      }
      throw new AppError('Invalid access token', 401, 'INVALID_TOKEN')
    }
  }

  const rawTicket = typeof req.query.ticket === 'string' ? req.query.ticket.trim() : ''
  if (rawTicket) {
    const user = consumeSseTicket(rawTicket)
    if (!user) {
      throw new AppError('Invalid or expired SSE ticket', 401, 'INVALID_SSE_TICKET')
    }
    req.user = {
      id: user.id,
      roles: normalizeRoles(user.roles || []),
    }
    return next()
  }

  throw new AppError('Authentication required', 401, 'UNAUTHORIZED')
})
