import { asyncHandler } from '../../middleware/errorHandler.js'
import * as adminDashboardService from './adminDashboard.service.js'

export const getDashboard = asyncHandler(async (_req, res) => {
  const data = await adminDashboardService.getAdminDashboard()
  res.status(200).json({ success: true, data })
})
