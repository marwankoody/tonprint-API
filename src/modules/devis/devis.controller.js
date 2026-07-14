import { asyncHandler } from '../../middleware/errorHandler.js'
import * as devisService from './devis.service.js'

/**
 * Honeypot rempli → 204 sans créer (anti-bot silencieux).
 * Champ `tp_hp` (pas "website" — souvent prérempli par autofill).
 */
export const createDevis = asyncHandler(async (req, res) => {
  if (String(req.body?.tp_hp || '').trim()) {
    return res.status(204).send()
  }

  const { tp_hp: _honeypot, deadline, ...rest } = req.body
  const devis = await devisService.createDevis(req.user.id, {
    ...rest,
    deadline: deadline || null,
  })
  res.status(201).json({ success: true, data: { devis } })
})

export const listMyDevis = asyncHandler(async (req, res) => {
  const result = await devisService.listMyDevis(req.user.id, req.validatedQuery ?? req.query)
  res.status(200).json({ success: true, data: result })
})

export const getMyDevis = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const devis = await devisService.getMyDevisById(id, req.user.id)
  res.status(200).json({ success: true, data: { devis } })
})

export const listDevisAdmin = asyncHandler(async (req, res) => {
  const result = await devisService.listDevisAdmin(req.validatedQuery ?? req.query)
  res.status(200).json({ success: true, data: result })
})

export const getDevisAdmin = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const devis = await devisService.getDevisAdmin(id)
  res.status(200).json({ success: true, data: { devis } })
})

export const updateDevisStatus = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const { status } = req.body
  const devis = await devisService.updateDevisStatus(id, status, req.user.id)
  res.status(200).json({ success: true, data: { devis } })
})
