import { Router } from 'express'
import { authenticate } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validate } from '../../middleware/validate.js'
import { uploadBlogCover } from '../../middleware/upload.js'
import { AppError } from '../../utils/AppError.js'
import {
  listBlogQuerySchema,
  adminListBlogQuerySchema,
  createBlogPostSchema,
  updateBlogPostSchema,
  blogIdParamSchema,
  blogSlugParamSchema,
  parseMultipartBlogBody,
} from './blog.validation.js'
import * as blogController from './blog.controller.js'

const router = Router()

router.get('/', validate(listBlogQuerySchema, 'query'), blogController.listPosts)

router.get(
  '/admin',
  authenticate,
  requireRole('admin'),
  validate(adminListBlogQuerySchema, 'query'),
  blogController.listPostsAdmin
)

router.get(
  '/admin/:id',
  authenticate,
  requireRole('admin'),
  validate(blogIdParamSchema, 'params'),
  blogController.getPostAdmin
)

router.get(
  '/:slug',
  validate(blogSlugParamSchema, 'params'),
  validate(listBlogQuerySchema.pick({ locale: true }), 'query'),
  blogController.getPostBySlug
)

router.post(
  '/',
  authenticate,
  requireRole('admin'),
  (req, res, next) => {
    uploadBlogCover(req, res, (err) => {
      if (err) return blogController.handleUploadErrors(err, req, res, next)
      try {
        req.body = parseMultipartBlogBody(req.body)
        next()
      } catch (e) {
        next(new AppError(e.message, 400, 'VALIDATION_ERROR'))
      }
    })
  },
  validate(createBlogPostSchema),
  blogController.createPost
)

router.put(
  '/:id',
  authenticate,
  requireRole('admin'),
  validate(blogIdParamSchema, 'params'),
  (req, res, next) => {
    uploadBlogCover(req, res, (err) => {
      if (err) return blogController.handleUploadErrors(err, req, res, next)
      try {
        req.body = parseMultipartBlogBody(req.body)
        next()
      } catch (e) {
        next(new AppError(e.message, 400, 'VALIDATION_ERROR'))
      }
    })
  },
  validate(updateBlogPostSchema),
  blogController.updatePost
)

router.delete(
  '/:id',
  authenticate,
  requireRole('admin'),
  validate(blogIdParamSchema, 'params'),
  blogController.deletePost
)

export default router
