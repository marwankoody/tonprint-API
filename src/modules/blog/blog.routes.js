import { Router } from 'express'
import { authenticate } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validate } from '../../middleware/validate.js'
import {
  listBlogQuerySchema,
  adminListBlogQuerySchema,
  createBlogPostSchema,
  updateBlogPostSchema,
  blogIdParamSchema,
  blogSlugParamSchema,
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
  validate(createBlogPostSchema),
  blogController.createPost
)

router.put(
  '/:id',
  authenticate,
  requireRole('admin'),
  validate(blogIdParamSchema, 'params'),
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
