import { Router } from 'express'
import { authenticate } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/requireRole.js'
import * as dashboardController from './creatorDashboard.controller.js'

const router = Router()

router.use(authenticate)

router.get('/dashboard', requireRole('client', 'admin'), dashboardController.getDashboard)

export default router
