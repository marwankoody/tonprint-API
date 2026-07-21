import sanitizeHtml from 'sanitize-html'

const COLOR_REGEXES = [
  // #RGB, #RRGGBB, #RRGGBBAA (optionnel legacy 0x)
  /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
  /^#(?:0x)?[0-9a-f]+$/i,
  // rgb / rgba
  /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+|1\.0|\d{1,3}%))?\s*\)$/i,
  /^rgba?\(\s*\d{1,3}\s+\d{1,3}\s+\d{1,3}(?:\s*\/\s*(?:0|1|0?\.\d+|1\.0|\d{1,3}%))?\s*\)$/i,
  // hsl / hsla — syntaxe virgules
  /^hsla?\(\s*\d+(?:\.\d+)?(?:deg)?\s*,\s*\d+(?:\.\d+)?%\s*,\s*\d+(?:\.\d+)?%(?:\s*,\s*(?:0|1|0?\.\d+|1\.0|\d{1,3}%))?\s*\)$/i,
  // hsl / hsla — syntaxe espaces (moderne)
  /^hsla?\(\s*\d+(?:\.\d+)?(?:deg)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%(?:\s*\/\s*(?:0|1|0?\.\d+|1\.0|\d{1,3}%))?\s*\)$/i,
]

/** Safe CSS font-family stacks (no url()/expression()). */
const FONT_FAMILY_REGEX =
  /^[a-zA-Z0-9\s,\-'"_.]+(?:\s*,\s*[a-zA-Z0-9\s,\-'"_.]+)*$/

const ALLOWED_TAGS = [
  'p',
  'br',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'a',
  'strong',
  'em',
  'u',
  'b',
  'i',
  's',
  'del',
  'span',
  'img',
  'blockquote',
]

/** Tags pouvant porter des styles inline Lexical (couleur, taille…). */
const STYLEABLE_TAGS = ['p', 'h2', 'h3', 'h4', 'span', 'li', 'blockquote', 'strong', 'em', 'u', 'b', 'i', 's', 'del']

const ALLOWED_STYLES = {
  '*': {
    color: COLOR_REGEXES,
    'background-color': COLOR_REGEXES,
    'font-size': [/^\d+(?:\.\d+)?(?:px|rem|em)$/],
    'font-family': [FONT_FAMILY_REGEX],
    'text-align': [/^left$/, /^center$/, /^right$/, /^justify$/],
  },
  img: {
    'max-width': [/^100%$/],
    height: [/^auto$/],
    display: [/^block$/],
    margin: [/^\d+(?:\.\d+)?(?:px|rem|em|%)?(?:\s+\d+(?:\.\d+)?(?:px|rem|em|%)?){0,3}$/],
  },
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

  /** @type {Record<string, string[]>} */
  const allowedAttributes = {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'style'],
  }
  for (const tag of STYLEABLE_TAGS) {
    allowedAttributes[tag] = ['style', 'class']
  }

  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes,
    allowedStyles: ALLOWED_STYLES,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['https'],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
      img(tagName, attribs) {
        const src = attribs.src || ''
        if (!/^https:\/\//i.test(src)) {
          return { tagName: 'span', text: '', attribs: {} }
        }
        return { tagName, attribs }
      },
    },
  }).trim()
}
