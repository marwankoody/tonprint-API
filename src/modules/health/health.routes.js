import { Router } from 'express'
import mongoose from 'mongoose'

const router = Router()

/**
 * Health check — utile pour vérifier que l'API et MongoDB sont up.
 * GET /api/health
 */
router.get('/', (_req, res) => {
  const dbState = mongoose.connection.readyState
  const dbStatus = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  }[dbState] || 'unknown'

  const healthy = dbState === 1

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStatus,
  })
})

export default router
