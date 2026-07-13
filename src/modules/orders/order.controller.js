import { asyncHandler } from '../../middleware/errorHandler.js'
import * as orderService from './order.service.js'

export const createOrder = asyncHandler(async (req, res) => {
  const order = await orderService.createOrder(req.user.id, req.body)
  res.status(201).json({ success: true, data: { order } })
})

export const listMyOrders = asyncHandler(async (req, res) => {
  const result = await orderService.listMyOrders(req.user.id, req.validatedQuery ?? req.query)
  res.status(200).json({ success: true, data: result })
})

export const listOrdersAdmin = asyncHandler(async (req, res) => {
  const result = await orderService.listOrdersAdmin(req.validatedQuery ?? req.query)
  res.status(200).json({ success: true, data: result })
})

export const getOrderAdmin = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderAdmin(req.params.id)
  res.status(200).json({ success: true, data: { order } })
})

export const getOrder = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderById(req.params.id, req.user)
  res.status(200).json({ success: true, data: { order } })
})

export const cancelOrder = asyncHandler(async (req, res) => {
  const order = await orderService.cancelOrder(req.params.id, req.user.id)
  res.status(200).json({ success: true, data: { order } })
})

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const order = await orderService.updateOrderStatus(req.params.id, req.body.status, req.user.id)
  res.status(200).json({ success: true, data: { order } })
})
