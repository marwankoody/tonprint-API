import { Router } from 'express'
import { authenticate } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validate } from '../../middleware/validate.js'
import {
  listUsersQuerySchema,
  userIdParamSchema,
  updateUserProfileSchema,
  updateUserRolesSchema,
  updateUserStatusSchema,
} from './user.admin.validation.js'
import * as userAdminController from './user.admin.controller.js'

const router = Router()

router.use(authenticate, requireRole('admin'))

router.get('/', validate(listUsersQuerySchema, 'query'), userAdminController.listUsers)

router.get(
  '/:id',
  validate(userIdParamSchema, 'params'),
  userAdminController.getUser
)

router.patch(
  '/:id',
  validate(userIdParamSchema, 'params'),
  validate(updateUserProfileSchema),
  userAdminController.updateUserProfile
)

router.patch(
  '/:id/roles',
  validate(userIdParamSchema, 'params'),
  validate(updateUserRolesSchema),
  userAdminController.updateUserRoles
)

router.patch(
  '/:id/status',
  validate(userIdParamSchema, 'params'),
  validate(updateUserStatusSchema),
  userAdminController.updateUserStatus
)

router.delete(
  '/:id',
  validate(userIdParamSchema, 'params'),
  userAdminController.deleteUser
)

export default router
