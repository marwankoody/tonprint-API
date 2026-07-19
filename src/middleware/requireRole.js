import { AppError } from '../utils/AppError.js'
import { USER_ROLES } from '../modules/auth/user.model.js'

/**
 * Middleware de vérification de rôle.
 * Doit être placé **après** `authenticate`.
 *
 * @param {...string} allowedRoles — un ou plusieurs rôles autorisés
 * @returns {import('express').RequestHandler}
 *
 * @example
 * router.get('/admin/orders', authenticate, requireRole('admin'), controller)
 * router.post('/designs', authenticate, requireRole('client'), controller)
 */
export function requireRole(...allowedRoles) {
  const invalid = allowedRoles.filter((r) => !USER_ROLES.includes(r))
  if (invalid.length > 0) {
    throw new Error(`Unknown roles in requireRole: ${invalid.join(', ')}`)
  }

  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'))
    }

    const userRoles = req.user.roles || []
    const hasRole = allowedRoles.some((role) => userRoles.includes(role))

    if (!hasRole) {
      return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'))
    }

    next()
  }
}
