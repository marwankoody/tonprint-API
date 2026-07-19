/**
 * Clé mois UTC au format `YYYY-MM` (aligné sur `$dateToString %Y-%m`).
 * @param {Date} date
 */
export function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Débuts de mois UTC des `window` derniers mois (du plus ancien au plus récent).
 * @param {number} window
 * @returns {Date[]}
 */
export function buildMonthBuckets(window) {
  const now = new Date()
  const buckets = []
  for (let offset = window - 1; offset >= 0; offset -= 1) {
    buckets.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1)))
  }
  return buckets
}
