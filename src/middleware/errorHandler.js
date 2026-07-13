import { AppError } from '../utils/AppError.js'

/**
 * Middleware d'erreur global Express.
 * Ne log jamais mots de passe, tokens ou données personnelles sensibles.
 */
export function errorHandler(err, _req, res, _next) {
  let statusCode = err.statusCode || 500
  let message = err.message || 'Internal server error'
  let code = err.code

  // Erreurs Mongoose courantes
  if (err.name === 'CastError') {
    statusCode = 400
    message = 'Invalid resource identifier'
    code = 'INVALID_ID'
  }

  if (err.name === 'ValidationError') {
    statusCode = 400
    message = Object.values(err.errors || {})
      .map((e) => e.message)
      .join(', ') || 'Validation failed'
    code = 'VALIDATION_ERROR'
  }

  if (err.code === 11000) {
    statusCode = 409
    const field = Object.keys(err.keyPattern || {})[0] || 'field'
    message = `Duplicate value for ${field}`
    code = 'DUPLICATE'
  }

  // Erreurs JWT
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401
    message = 'Invalid token'
    code = 'INVALID_TOKEN'
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401
    message = 'Token expired'
    code = 'TOKEN_EXPIRED'
  }

  // Log serveur (sans données sensibles)
  if (statusCode >= 500) {
    console.error(`[ERROR] ${err.name || 'Error'}: ${message}`)
    if (!(err instanceof AppError) && err.stack) {
      console.error(err.stack)
    }
  }

  res.status(statusCode).json({
    success: false,
    message: statusCode === 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : message,
    ...(code && { code }),
  })
}

/**
 * Wrapper async pour éviter les try/catch dans chaque controller.
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<unknown>} fn
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
