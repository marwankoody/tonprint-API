const UNIT_TO_MS = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
}

/**
 * Convertit une durée courte (ex: "15m", "7d", "1h") en millisecondes.
 * Utilisé pour dériver le `maxAge` d'un cookie depuis `JWT_REFRESH_EXPIRES_IN`.
 *
 * @param {string} duration
 * @returns {number}
 */
export function parseDurationToMs(duration) {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(String(duration).trim())

  if (!match) {
    throw new Error(`Invalid duration format: "${duration}" (expected e.g. "15m", "7d")`)
  }

  const [, value, unit] = match
  return Number(value) * UNIT_TO_MS[unit]
}
