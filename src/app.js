import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import compression from 'compression'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import { corsOrigins, env } from './config/env.js'
import { notFound } from './middleware/notFound.js'
import { errorHandler } from './middleware/errorHandler.js'
import { apiLimiter } from './middleware/rateLimiters.js'
import { AppError } from './utils/AppError.js'
import healthRoutes from './modules/health/health.routes.js'
import authRoutes from './modules/auth/auth.routes.js'
import productsRoutes from './modules/products/product.routes.js'
import ordersRoutes from './modules/orders/order.routes.js'
import blogRoutes from './modules/blog/blog.routes.js'
import userAdminRoutes from './modules/users/user.admin.routes.js'
import devisRoutes from './modules/devis/devis.routes.js'
import designsRoutes from './modules/designs/design.routes.js'
import designAdminRoutes from './modules/designs/design.admin.routes.js'
import pointsRoutes from './modules/points/points.routes.js'
import creatorRoutes from './modules/creator/creator.routes.js'
import contactRoutes from './modules/contact/contact.routes.js'
import notificationRoutes from './modules/notifications/notification.routes.js'
import adminRoutes from './modules/admin/admin.routes.js'
import adminMediaRoutes from './modules/admin/adminMedia.routes.js'

const app = express()

// En production, l'API tourne derrière un reverse proxy (Nginx/Cloudflare) qui gère le TLS
// pour tonprint.ma. `trust proxy` permet à Express de lire le vrai protocole/IP client
// (req.secure, req.ip) transmis via les headers X-Forwarded-*, requis pour les cookies `secure`.
if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1)
}

// Sécurité — CORP en cross-origin : l'API est appelée depuis www.tonprint.ma
// CSP API minimal (JSON only) — le CSP SPA est côté frontend / reverse proxy.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
  })
)
app.use(
  cors({
    origin(origin, callback) {
      // Autoriser les requêtes sans Origin (Postman, curl, health checks serveur)
      if (!origin || corsOrigins.includes(origin)) {
        return callback(null, true)
      }
      return callback(new AppError(`CORS blocked for origin: ${origin}`, 403, 'CORS_BLOCKED'))
    },
    credentials: true,
  })
)

// Parsing
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))
app.use(cookieParser())

// Performance — ne compresse pas les flux SSE (sinon buffering / latence).
app.use(
  compression({
    filter(req, res) {
      if (req.path?.includes('/notifications/stream')) return false
      if (req.headers.accept === 'text/event-stream') return false
      return compression.filter(req, res)
    },
  })
)

// Logger HTTP — sans données sensibles (pas de body / token SSE)
if (env.NODE_ENV !== 'test') {
  morgan.token('safe-url', (req) => {
    const raw = req.originalUrl || req.url || ''
    return raw
      .replace(/([?&]access_token=)[^&]*/gi, '$1[REDACTED]')
      .replace(/([?&]ticket=)[^&]*/gi, '$1[REDACTED]')
  })
  app.use(
    morgan(env.NODE_ENV === 'production' ? ':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length]' : ':method :safe-url :status :response-time ms')
  )
}

// Garde-fou anti-abus/DoS global — les endpoints sensibles ont leurs propres
// limiteurs plus stricts (voir rateLimiters.js), appliqués en plus de celui-ci.
app.use('/api', apiLimiter)

// Routes API
app.use('/api/health', healthRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/products', productsRoutes)
app.use('/api/orders', ordersRoutes)
app.use('/api/blog', blogRoutes)
app.use('/api/devis', devisRoutes)
app.use('/api/designs', designsRoutes)
app.use('/api/admin/designs', designAdminRoutes)
app.use('/api/admin/users', userAdminRoutes)
app.use('/api/admin/media', adminMediaRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/points', pointsRoutes)
app.use('/api/creator', creatorRoutes)
app.use('/api/contact', contactRoutes)
app.use('/api/notifications', notificationRoutes)

// 404 + erreurs
app.use(notFound)
app.use(errorHandler)

export default app
