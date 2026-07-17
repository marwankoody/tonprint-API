import { asyncHandler } from '../../middleware/errorHandler.js'
import * as pointsService from './points.service.js'

export const getBalance = asyncHandler(async (req, res) => {
  const data = await pointsService.getBalance(req.user.id)
  res.status(200).json({ success: true, data })
})

export const getHistory = asyncHandler(async (req, res) => {
  const data = await pointsService.getHistory(req.user.id, req.validatedQuery ?? req.query)
  res.status(200).json({ success: true, data })
})

export const redeem = asyncHandler(async (req, res) => {
  const data = await pointsService.redeemProduct(req.user.id, req.body)
  res.status(201).json({ success: true, data })
})

export const adminAdjust = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const data = await pointsService.adminAdjustPoints(id, req.body, req.user.id)
  res.status(200).json({ success: true, data })
})
