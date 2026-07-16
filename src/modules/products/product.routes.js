import { Router } from 'express'
import { authenticate } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validate } from '../../middleware/validate.js'
import { uploadProductImages, uploadPrintAreaMockupFile } from '../../middleware/upload.js'
import { AppError } from '../../utils/AppError.js'
import {
  listProductsQuerySchema,
  adminListProductsQuerySchema,
  createProductSchema,
  updateProductSchema,
  parseMultipartProductBody,
} from './product.validation.js'
import * as productController from './product.controller.js'

const router = Router()

// --- Routes publiques (catalogue marketplace) ---
router.get('/', validate(listProductsQuerySchema, 'query'), productController.listProducts)

// --- Routes admin (dashboard gestion catalogue) — déclarées avant `/:id` pour éviter le conflit de path ---
router.get(
  '/admin',
  authenticate,
  requireRole('admin'),
  validate(adminListProductsQuerySchema, 'query'),
  productController.listProductsAdmin
)
router.get('/admin/:id', authenticate, requireRole('admin'), productController.getProductAdmin)

/** Upload d'un mockup de zone d'impression (formulaire produit admin, champ `mockup`). */
router.post(
  '/admin/print-area-mockups',
  authenticate,
  requireRole('admin'),
  (req, res, next) => {
    uploadPrintAreaMockupFile(req, res, (err) => {
      if (err) return productController.handleUploadErrors(err, req, res, next)
      next()
    })
  },
  productController.uploadPrintAreaMockup
)

router.get('/:id', productController.getProduct)

// --- Routes admin (CRUD + upload Cloudinary) ---
router.post(
  '/',
  authenticate,
  requireRole('admin'),
  (req, res, next) => {
    uploadProductImages(req, res, (err) => {
      if (err) return productController.handleUploadErrors(err, req, res, next)
      try {
        req.body = parseMultipartProductBody(req.body)
        next()
      } catch (e) {
        next(new AppError(e.message, 400, 'VALIDATION_ERROR'))
      }
    })
  },
  validate(createProductSchema),
  productController.createProduct
)

router.put(
  '/:id',
  authenticate,
  requireRole('admin'),
  (req, res, next) => {
    uploadProductImages(req, res, (err) => {
      if (err) return productController.handleUploadErrors(err, req, res, next)
      try {
        req.body = parseMultipartProductBody(req.body)
        next()
      } catch (e) {
        next(new AppError(e.message, 400, 'VALIDATION_ERROR'))
      }
    })
  },
  validate(updateProductSchema),
  productController.updateProduct
)

router.delete(
  '/:id',
  authenticate,
  requireRole('admin'),
  productController.deleteProduct
)

export default router
