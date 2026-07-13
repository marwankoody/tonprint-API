import { Router } from 'express'
import { authenticate } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { authLimiter, refreshLimiter } from '../../middleware/rateLimiters.js'
import { registerSchema, loginSchema } from './auth.validation.js'
import * as authController from './auth.controller.js'

const router = Router()

router.post('/register', authLimiter, validate(registerSchema), authController.register)
router.post('/login', authLimiter, validate(loginSchema), authController.login)
router.post('/refresh', refreshLimiter, authController.refreshTokens)
router.post('/logout', authenticate, authController.logout)
router.get('/me', authenticate, authController.getMe)

export default router
