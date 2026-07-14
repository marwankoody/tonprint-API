import { sanitizeRichHtml } from '../../utils/sanitizeHtml.js'

/**
 * Sanitize HTML Lexical pour stockage sécurisé.
 * @param {string} html
 * @returns {string}
 */
export function sanitizeBlogHtml(html) {
  return sanitizeRichHtml(html)
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
