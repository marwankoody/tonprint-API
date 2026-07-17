import { asyncHandler } from '../../middleware/errorHandler.js'
import * as dashboardService from './creatorDashboard.service.js'

export const getDashboard = asyncHandler(async (req, res) => {
  const data = await dashboardService.getCreatorDashboard(req.user.id)
  res.status(200).json({ success: true, data })
})
