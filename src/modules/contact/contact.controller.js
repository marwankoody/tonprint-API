import { asyncHandler } from '../../middleware/errorHandler.js'
import * as contactService from './contact.service.js'

export const createContact = asyncHandler(async (req, res) => {
  const payload = req.body
  await contactService.submitContactMessage(payload, {
    ip: req.ip,
  })
  res.status(201).json({ success: true, data: { ok: true } })
})
