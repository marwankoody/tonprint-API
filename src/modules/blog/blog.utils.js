import sanitizeHtml from 'sanitize-html'

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
 * Sanitize HTML Lexical pour stockage sécurisé.
 * @param {string} html
 * @returns {string}
 */
export function sanitizeBlogHtml(html) {
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
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
    },
  }).trim()
}

/**
 * Estime le temps de lecture (mots / 200, min 1).
 * @param {string} html
 * @returns {number}
 */
export function estimateReadingTimeMinutes(html) {
  const text = String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = text ? text.split(' ').length : 0
  return Math.max(1, Math.ceil(words / 200))
}

/**
 * Slugify basique (ASCII) pour URLs blog.
 * @param {string} value
 * @returns {string}
 */
export function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}
