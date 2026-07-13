import { AppError } from '../utils/AppError.js'

/**
 * Middleware 404 — route non trouvée.
 */
export function notFound(_req, _res, next) {
  next(new AppError('Route not found', 404, 'NOT_FOUND'))
}
