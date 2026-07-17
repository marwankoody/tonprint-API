import { Router } from 'express'
import { validate } from '../../middleware/validate.js'
import { contactFormLimiter } from '../../middleware/rateLimiters.js'
import { createContactSchema } from './contact.validation.js'
import * as contactController from './contact.controller.js'

const router = Router()

/** Formulaire public Contact → Google Sheets (Apps Script). */
router.post(
  '/',
  contactFormLimiter,
  validate(createContactSchema),
  contactController.createContact
)

export default router
