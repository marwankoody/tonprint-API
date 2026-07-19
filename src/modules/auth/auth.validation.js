import { z } from 'zod'
import { normalizeMoroccoPhone, MOROCCO_PHONE_REGEX } from '../../utils/moroccoPhone.js'

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Invalid email address')
    .max(254, 'Email must be at most 254 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
})

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Invalid email address')
    .max(254, 'Email must be at most 254 characters'),
  password: z.string().min(1, 'Password is required').max(72, 'Password is too long'),
})

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Invalid email address')
    .max(254, 'Email must be at most 254 characters'),
  phone: z
    .string()
    .trim()
    .max(30, 'Phone must be at most 30 characters')
    .optional()
    .default('')
    .transform((v) => (v ? normalizeMoroccoPhone(v) : ''))
    .refine((v) => v === '' || MOROCCO_PHONE_REGEX.test(v), {
      message: 'Invalid Moroccan phone number',
    }),
  city: z
    .string()
    .trim()
    .max(80, 'City must be at most 80 characters')
    .optional()
    .default(''),
  address: z
    .string()
    .trim()
    .max(250, 'Address must be at most 250 characters')
    .optional()
    .default(''),
  postalCode: z
    .string()
    .trim()
    .max(20, 'Postal code must be at most 20 characters')
    .optional()
    .default(''),
})

export const changePasswordSchema = z
  .object({
  currentPassword: z.string().min(1, 'Current password is required').max(72),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(72),
  confirmPassword: z.string().min(1, 'Password confirmation is required').max(72),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  })
