import crypto from 'node:crypto'

const TICKET_TTL_MS = 60_000
const CLEANUP_INTERVAL_MS = 30_000

/** @type {Map<string, { userId: string, roles: string[], expiresAt: number }>} */
const tickets = new Map()

let cleanupTimer = null

function ensureCleanup() {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of tickets) {
      if (entry.expiresAt <= now) tickets.delete(key)
    }
  }, CLEANUP_INTERVAL_MS)
  // Ne pas bloquer l'arrêt du process Node.
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref()
}

/**
 * Émet un ticket SSE one-shot (TTL court).
 * @param {{ id: string, roles: string[] }} user
 * @returns {{ ticket: string, expiresIn: number }}
 */
export function issueSseTicket(user) {
  ensureCleanup()
  const ticket = crypto.randomBytes(32).toString('hex')
  tickets.set(ticket, {
    userId: String(user.id),
    roles: user.roles || [],
    expiresAt: Date.now() + TICKET_TTL_MS,
  })
  return { ticket, expiresIn: Math.floor(TICKET_TTL_MS / 1000) }
}

/**
 * Consomme un ticket (one-shot). Retourne le payload user ou null.
 * @param {string} ticket
 * @returns {{ id: string, roles: string[] } | null}
 */
export function consumeSseTicket(ticket) {
  if (!ticket || typeof ticket !== 'string') return null
  const entry = tickets.get(ticket)
  tickets.delete(ticket)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) return null
  return { id: entry.userId, roles: entry.roles }
}
