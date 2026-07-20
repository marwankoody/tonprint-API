import { z } from 'zod'

export const adminMediaDownloadQuerySchema = z.object({
  url: z.string().url().max(2000),
  filename: z
    .string()
    .trim()
    .max(180)
    .regex(/^[a-zA-Z0-9._-]+$/)
    .optional()
    .default('download.png'),
})
