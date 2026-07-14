import { z } from 'zod'
import { USER_ROLES } from '../auth/user.model.js'

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, 'Invalid id')

const coerceBool = z.preprocess((val) => {
  if (val === 'true' || val === true) return true
  if (val === 'false' || val === false) return false
  return val
}, z.boolean())

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(100).optional(),
  role: z
    .string()
    .refine((val) => USER_ROLES.includes(val), { message: 'Invalid role' })
    .optional(),
  isActive: coerceBool.optional(),
})

export const userIdParamSchema = z.object({
  id: objectIdSchema,
})

export const updateUserProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  phone: z
    .string()
    .trim()
    .max(30, 'Phone must be at most 30 characters')
    .optional()
    .default(''),
})

export const updateUserRolesSchema = z.object({
  roles: z
    .array(z.string().refine((val) => USER_ROLES.includes(val), { message: 'Invalid role' }))
    .min(1, 'At least one role is required')
    .max(USER_ROLES.length),
})

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
})
