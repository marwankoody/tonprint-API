import { asyncHandler } from '../../middleware/errorHandler.js'
import * as designService from './design.service.js'

export const createDesign = asyncHandler(async (req, res) => {
  const design = await designService.createDesign(req.user.id, req.body)
  res.status(201).json({ success: true, data: { design } })
})

export const updateDesign = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const design = await designService.updateDesign(id, req.user.id, req.body)
  res.status(200).json({ success: true, data: { design } })
})

export const listMyDesigns = asyncHandler(async (req, res) => {
  const result = await designService.listMyDesigns(req.user.id, req.validatedQuery ?? req.query)
  res.status(200).json({ success: true, data: result })
})

export const getMyDesign = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const design = await designService.getMyDesignById(id, req.user.id)
  res.status(200).json({ success: true, data: { design } })
})

export const deleteDesign = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  await designService.deleteDesign(id, req.user.id)
  res.status(200).json({ success: true, data: null })
})

export const uploadImage = asyncHandler(async (req, res) => {
  const result = await designService.uploadCreatorImage(req.user.id, req.file)
  res.status(201).json({ success: true, data: result })
})

export const saveZoneAssets = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const design = await designService.saveZoneAssets(id, req.user.id, req.body.zone, req.files)
  res.status(200).json({ success: true, data: { design } })
})

export const submitDesign = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const design = await designService.submitDesign(id, req.user.id)
  res.status(200).json({ success: true, data: { design } })
})

export const withdrawDesign = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const design = await designService.withdrawDesign(id, req.user.id)
  res.status(200).json({ success: true, data: { design } })
})

export const listAdminDesigns = asyncHandler(async (req, res) => {
  const result = await designService.listAdminDesigns(req.validatedQuery ?? req.query)
  res.status(200).json({ success: true, data: result })
})

export const approveDesign = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const design = await designService.approveDesign(id)
  res.status(200).json({ success: true, data: { design } })
})

export const rejectDesign = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const design = await designService.rejectDesign(id, req.body.reason)
  res.status(200).json({ success: true, data: { design } })
})
