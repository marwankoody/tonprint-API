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

const app = express()

// En production, l'API tourne derrière un reverse proxy (Nginx/Cloudflare) qui gère le TLS
// pour tonprint.ma. `trust proxy` permet à Express de lire le vrai protocole/IP client
// (req.secure, req.ip) transmis via les headers X-Forwarded-*, requis pour les cookies `secure`.
if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1)
}

// Sécurité — CORP en cross-origin : l'API est appelée depuis www.tonprint.ma
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
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
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

// Performance
app.use(compression())

// Logger HTTP — sans données sensibles (pas de body)
if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'))
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
app.use('/api/admin/users', userAdminRoutes)

// Modules métier (Phase 5+)
// app.use('/api/designs', designsRoutes)
// app.use('/api/points', pointsRoutes)

// 404 + erreurs
app.use(notFound)
app.use(errorHandler)

export default app
