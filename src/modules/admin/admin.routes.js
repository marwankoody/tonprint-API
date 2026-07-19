import { Router } from 'express'
import { authenticate } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/requireRole.js'
import * as dashboardController from './adminDashboard.controller.js'

const router = Router()

router.use(authenticate, requireRole('admin'))

router.get('/dashboard', dashboardController.getDashboard)

export default router
