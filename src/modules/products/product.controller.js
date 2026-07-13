import { asyncHandler } from '../../middleware/errorHandler.js'
import { AppError } from '../../utils/AppError.js'
import * as productService from './product.service.js'

export const listProducts = asyncHandler(async (req, res) => {
  const result = await productService.listProducts(req.validatedQuery ?? req.query)
  res.status(200).json({ success: true, data: result })
})

export const getProduct = asyncHandler(async (req, res) => {
  const product = await productService.getProductById(req.params.id)
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

/**
 * Middleware Multer : transmet les erreurs Multer au handler global.
 * @type {import('express').RequestHandler}
 */
export const handleUploadErrors = (err, _req, _res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return next(new AppError('Image too large (max 5 MB)', 400, 'FILE_TOO_LARGE'))
  }
  if (err?.code === 'LIMIT_FILE_COUNT') {
    return next(new AppError('Too many images (max 5)', 400, 'TOO_MANY_FILES'))
  }
  return next(err)
}
