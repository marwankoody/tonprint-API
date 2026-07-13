import { AppError } from '../utils/AppError.js'

/**
 * Middleware de validation Zod générique.
 * Remplace `req[source]` par les données validées/transformées (trim, lowercase, coercion…).
 *
 * @param {import('zod').ZodType} schema
 * @param {'body' | 'query' | 'params'} [source='body']
 * @returns {import('express').RequestHandler}
 */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    // Express 5 : `req.query` est en lecture seule — on clone avant parse Zod
    // (Zod peut muter l'objet d'entrée lors des coercions).
    const input =
      source === 'query' ? { ...req.query } : source === 'params' ? { ...req.params } : req[source]

    const result = schema.safeParse(input)

    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join('.') || source}: ${issue.message}`)
        .join('; ')
      return next(new AppError(message, 400, 'VALIDATION_ERROR'))
    }

    const data = result.data

    // Express 5 : `req.query` / `req.params` sont en lecture seule —
    // on stocke les données validées sur des propriétés dédiées.
    if (source === 'query') {
      req.validatedQuery = data
    } else if (source === 'params') {
      req.validatedParams = data
    } else {
      req[source] = data
    }

    next()
  }
}
