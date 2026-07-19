import { asyncHandler } from '../../middleware/errorHandler.js'
import * as productService from './product.service.js'

export const listProducts = asyncHandler(async (req, res) => {
  const result = await productService.listProducts(req.validatedQuery ?? req.query)
  res.status(200).json({ success: true, data: result })
})

export const getProduct = asyncHandler(async (req, res) => {
  // `channel=personalization` → fiche produit du catalogue créateur (éditeur).
  const channel = req.query.channel === 'personalization' ? 'personalization' : 'marketplace'
  const product = await productService.getProductById(req.params.id, { channel })
  res.status(200).json({ success: true, data: { product } })
})

export const listProductsAdmin = asyncHandler(async (req, res) => {
  const result = await productService.listProductsAdmin(req.validatedQuery ?? req.query)
  res.status(200).json({ success: true, data: result })
})

export const getProductAdmin = asyncHandler(async (req, res) => {
  const product = await productService.getProductByIdAdmin(req.params.id)
  res.status(200).json({ success: true, data: { product } })
})

export const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.body, req.files)
  res.status(201).json({ success: true, data: { product } })
})

export const updateProduct = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(req.params.id, req.body, req.files)
  res.status(200).json({ success: true, data: { product } })
})

export const deleteProduct = asyncHandler(async (req, res) => {
  const result = await productService.deleteProduct(req.params.id)
  res.status(200).json({ success: true, data: result })
})

export const uploadPrintAreaMockup = asyncHandler(async (req, res) => {
  const mockup = await productService.uploadMockup(req.file)
  res.status(201).json({ success: true, data: { mockup } })
})
