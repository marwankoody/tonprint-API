import { asyncHandler } from '../../middleware/errorHandler.js'
import * as blogService from './blog.service.js'

export const listPosts = asyncHandler(async (req, res) => {
  const result = await blogService.listPublishedPosts(req.validatedQuery ?? req.query)
  res.status(200).json({ success: true, data: result })
})

export const getPostBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.validatedParams ?? req.params
  const locale = req.validatedQuery?.locale ?? req.query.locale ?? 'fr'
  const post = await blogService.getPublishedPostBySlug(slug, locale)
  res.status(200).json({ success: true, data: { post } })
})

export const listPostsAdmin = asyncHandler(async (req, res) => {
  const result = await blogService.listPostsAdmin(req.validatedQuery ?? req.query)
  res.status(200).json({ success: true, data: result })
})

export const getPostAdmin = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const post = await blogService.getPostAdmin(id)
  res.status(200).json({ success: true, data: { post } })
})

export const createPost = asyncHandler(async (req, res) => {
  const post = await blogService.createPost(req.body, req.file, req.user.id)
  res.status(201).json({ success: true, data: { post } })
})

export const updatePost = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const post = await blogService.updatePost(id, req.body, req.file)
  res.status(200).json({ success: true, data: { post } })
})

export const deletePost = asyncHandler(async (req, res) => {
  const { id } = req.validatedParams ?? req.params
  const result = await blogService.deletePost(id)
  res.status(200).json({ success: true, data: result })
})
