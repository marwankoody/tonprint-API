/**
 * Parse et borne les paramètres de pagination skip/limit.
 * @param {{ page?: string|number, limit?: string|number }} query
 * @param {{ maxLimit?: number, defaultLimit?: number }} [options]
 * @returns {{ page: number, limit: number, skip: number }}
 */
export function parsePagination(query, options = {}) {
  const maxLimit = options.maxLimit ?? 20
  const defaultLimit = options.defaultLimit ?? 10

  const page = Math.max(1, Number.parseInt(String(query.page ?? 1), 10) || 1)
  let limit = Number.parseInt(String(query.limit ?? defaultLimit), 10) || defaultLimit
  limit = Math.min(Math.max(1, limit), maxLimit)

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  }
}

/**
 * Construit les métadonnées de pagination standardisées.
 * @param {{ page: number, limit: number, total: number }} params
 */
export function paginationMeta({ page, limit, total }) {
  const totalPages = Math.ceil(total / limit) || 1
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  }
}
