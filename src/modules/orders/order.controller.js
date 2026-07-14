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
  const { id } = req.validatedParams ?? req.params
  const order = await orderService.getOrderAdmin(id)
  res.status(200).json({ success: true, data: { order } })
})

export const getOrder = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const order = await orderService.getOrderById(id, req.user)
  res.status(200).json({ success: true, data: { order } })
})

export const cancelOrder = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const order = await orderService.cancelOrder(id, req.user.id)
  res.status(200).json({ success: true, data: { order } })
})

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const order = await orderService.updateOrderStatus(id, req.body.status, req.user.id)
  res.status(200).json({ success: true, data: { order } })
})
