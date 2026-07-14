import { asyncHandler } from '../../middleware/errorHandler.js'
import * as userAdminService from './user.admin.service.js'

export const listUsers = asyncHandler(async (req, res) => {
  const result = await userAdminService.listUsers(req.validatedQuery ?? req.query)
  res.status(200).json({ success: true, data: result })
})

export const getUser = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const user = await userAdminService.getUserById(id)
  res.status(200).json({ success: true, data: { user } })
})

export const updateUserProfile = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const user = await userAdminService.updateUserProfile(id, req.body)
  res.status(200).json({ success: true, data: { user } })
})

export const updateUserRoles = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const user = await userAdminService.updateUserRoles(id, req.body.roles, req.user.id)
  res.status(200).json({ success: true, data: { user } })
})

export const updateUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const user = await userAdminService.updateUserStatus(id, req.body.isActive, req.user.id)
  res.status(200).json({ success: true, data: { user } })
})

export const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const result = await userAdminService.deleteUser(id, req.user.id)
  res.status(200).json({ success: true, data: result })
})
