import mongoose from 'mongoose'

const { Schema, model } = mongoose

export const BLOG_CATEGORIES = Object.freeze([
  'inspiration',
  'creators',
  'business',
  'behind_scenes',
  'trends',
  'guide',
])

export const BLOG_LOCALES = Object.freeze(['fr', 'en', 'ar'])

const coverImageSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false }
)

const localeContentSchema = new Schema(
  {
    title: { type: String, trim: true, maxlength: 200, default: '' },
    excerpt: { type: String, trim: true, maxlength: 500, default: '' },
    /** HTML riche (éditeur Lexical côté admin). */
    content: { type: String, trim: true, maxlength: 20000, default: '' },
    metaTitle: { type: String, trim: true, maxlength: 70, default: '' },
    metaDescription: { type: String, trim: true, maxlength: 160, default: '' },
  },
  { _id: false }
)

const blogPostSchema = new Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 120,
    },
    category: {
      type: String,
      required: true,
      enum: BLOG_CATEGORIES,
      index: true,
    },
    coverImage: {
      type: coverImageSchema,
      default: null,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isPublished: {
      type: Boolean,
      default: false,
      index: true,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    readingTimeMinutes: {
      type: Number,
      min: 1,
      default: 1,
    },
    locales: {
      fr: { type: localeContentSchema, default: () => ({}) },
      en: { type: localeContentSchema, default: () => ({}) },
      ar: { type: localeContentSchema, default: () => ({}) },
    },
  },
  { timestamps: true }
)

blogPostSchema.index({ isPublished: 1, publishedAt: -1 })
blogPostSchema.index({ category: 1, isPublished: 1, publishedAt: -1 })

export const BlogPost = model('BlogPost', blogPostSchema)
