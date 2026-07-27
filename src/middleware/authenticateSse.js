import { AppError } from '../utils/AppError.js'
import { asyncHandler } from './errorHandler.js'
import { resolveAccessUser } from './auth.js'
import { User, normalizeRoles } from '../modules/auth/user.model.js'
import { consumeSseTicket } from '../modules/notifications/sseTicket.store.js'

/**
 * Auth pour SSE : EventSource ne permet pas d'headers custom.
 * Accepte `Authorization: Bearer` **ou** `?ticket=` (one-shot, TTL court).
 * Ne loggue jamais le ticket (morgan masque la query).
 */
export const authenticateSse = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    req.user = await resolveAccessUser(header.slice(7))
    return next()
  }

  const rawTicket = typeof req.query.ticket === 'string' ? req.query.ticket.trim() : ''
  if (rawTicket) {
    const ticketUser = consumeSseTicket(rawTicket)
    if (!ticketUser) {
      throw new AppError('Invalid or expired SSE ticket', 401, 'INVALID_SSE_TICKET')
    }

    const user = await User.findById(ticketUser.id).select('roles isActive').lean()
    if (!user || user.isActive === false) {
      throw new AppError('This account has been disabled', 401, 'ACCOUNT_DISABLED')
    }

    req.user = {
      id: user._id.toString(),
      roles: normalizeRoles(user.roles),
    }
    return next()
  }

  throw new AppError('Authentication required', 401, 'UNAUTHORIZED')
})
