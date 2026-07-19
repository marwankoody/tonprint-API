import sanitizeHtml from 'sanitize-html'
import { env } from '../config/env.js'

const ALLOWED_TAGS = [
  'p',
  'br',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'a',
  'strong',
  'em',
  'u',
  'b',
  'i',
  'span',
  'img',
]

const ALLOWED_STYLES = {
  '*': {
    color: [
      /^#(0x)?[0-9a-f]+$/i,
      /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/,
      /^hsl\(\s*\d+(?:\.\d+)?(?:deg)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%\s*\)$/i,
      /^hsl\(\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?%\s*,\s*\d+(?:\.\d+)?%\s*\)$/i,
    ],
    'font-size': [/^\d+(?:\.\d+)?(?:px|rem|em)$/],
    'text-align': [/^left$/, /^center$/, /^right$/, /^justify$/],
  },
}

/**
 * Autorise uniquement les images hébergées sur notre cloud Cloudinary.
 * @param {string} src
 */
function isAllowedImageSrc(src) {
  if (!src || typeof src !== 'string') return false
  const cloud = env.CLOUDINARY_CLOUD_NAME
  if (!cloud) return false
  const prefix = `https://res.cloudinary.com/${cloud}/`
  return src.startsWith(prefix)
}

/**
 * Sanitize un HTML riche (éditeur Lexical) pour stockage sécurisé — utilisé
 * par tout contenu HTML de confiance-partielle (blog, description produit…)
 * avant persistance et rendu via `dangerouslySetInnerHTML` côté client.
 * @param {string} html
 * @returns {string}
 */
export function sanitizeRichHtml(html) {
  if (!html || typeof html !== 'string') return ''

  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'style'],
      p: ['style', 'class'],
      h2: ['style', 'class'],
      h3: ['style', 'class'],
      span: ['style', 'class'],
      li: ['style', 'class'],
    },
    allowedStyles: ALLOWED_STYLES,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['https'],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
      img(tagName, attribs) {
        if (!isAllowedImageSrc(attribs.src)) {
          return { tagName: 'span', text: '', attribs: {} }
        }
        return { tagName, attribs }
      },
    },
  }).trim()
}
