/**
 * Hub SSE in-memory : userId → Set<ServerResponse>, admins → Set.
 * Limite 3 connexions / user pour anti-abus.
 */

const MAX_CONNECTIONS_PER_USER = 3
const HEARTBEAT_MS = 25_000

/** @type {Map<string, Set<import('http').ServerResponse>>} */
const userConnections = new Map()

/** @type {Map<string, Set<import('http').ServerResponse>>} */
const adminConnections = new Map()

/**
 * @param {Map<string, Set<import('http').ServerResponse>>} map
 * @param {string} key
 * @param {import('http').ServerResponse} res
 */
function addConnection(map, key, res) {
  let set = map.get(key)
  if (!set) {
    set = new Set()
    map.set(key, set)
  }

  // Évince les plus anciennes si trop de connexions.
  while (set.size >= MAX_CONNECTIONS_PER_USER) {
    const oldest = set.values().next().value
    if (!oldest) break
    set.delete(oldest)
    try {
      oldest.end()
    } catch {
      // ignore
    }
  }

  set.add(res)
}

/**
 * @param {Map<string, Set<import('http').ServerResponse>>} map
 * @param {string} key
 * @param {import('http').ServerResponse} res
 */
function removeConnection(map, key, res) {
  const set = map.get(key)
  if (!set) return
  set.delete(res)
  if (set.size === 0) map.delete(key)
}

/**
 * @param {import('http').ServerResponse} res
 * @param {string} event
 * @param {object} data
 */
function writeEvent(res, event, data) {
  if (res.writableEnded) return
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

/**
 * Ouvre un flux SSE et enregistre la connexion.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ id: string, roles: string[] }} user
 */
export function registerSseClient(req, res, user) {
  // Désactive le timeout socket pour les connexions longues.
  req.socket?.setTimeout?.(0)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  if (typeof res.flushHeaders === 'function') res.flushHeaders()

  writeEvent(res, 'connected', { ok: true, at: new Date().toISOString() })

  addConnection(userConnections, user.id, res)

  const isAdmin = (user.roles || []).includes('admin')
  if (isAdmin) {
    addConnection(adminConnections, user.id, res)
  }

  const heartbeat = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(heartbeat)
      return
    }
    try {
      res.write(`: ping ${Date.now()}\n\n`)
    } catch {
      clearInterval(heartbeat)
    }
  }, HEARTBEAT_MS)

  const cleanup = () => {
    clearInterval(heartbeat)
    removeConnection(userConnections, user.id, res)
    if (isAdmin) removeConnection(adminConnections, user.id, res)
  }

  req.on('close', cleanup)
  res.on('close', cleanup)
  res.on('error', cleanup)
}

/**
 * @param {string} userId
 * @param {object} notification
 */
export function sendToUser(userId, notification) {
  if (!userId) return
  const set = userConnections.get(String(userId))
  if (!set?.size) return

  for (const res of set) {
    try {
      writeEvent(res, 'notification', notification)
    } catch {
      // ignore broken pipe
    }
  }
}

/**
 * Pousse vers toutes les connexions admin enregistrées.
 * @param {object} notificationPayload — payload générique (sans userId spécifique)
 * @param {Map<string, object>} [perAdminPayloads] — notif formatée par adminId
 */
export function broadcastAdmins(perAdminPayloads) {
  if (!perAdminPayloads?.size) return

  for (const [adminId, payload] of perAdminPayloads) {
    const set = adminConnections.get(String(adminId))
    if (!set?.size) continue
    for (const res of set) {
      try {
        writeEvent(res, 'notification', payload)
      } catch {
        // ignore
      }
    }
  }
}
