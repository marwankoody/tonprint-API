/**
 * Normalise un numéro marocain vers `0XXXXXXXXX` ou `+212XXXXXXXXX`.
 * Accepte espaces, tirets, points, parenthèses, `212…` sans `+`, `00212…`,
 * et les 9 chiffres sans le 0 initial.
 *
 * @param {string} [input]
 * @returns {string}
 */
export function normalizeMoroccoPhone(input = '') {
  const raw = String(input).trim()
  if (!raw) return ''

  let digits = raw.replace(/\D/g, '')

  if (digits.startsWith('00212')) {
    digits = digits.slice(2)
  }

  if (/^212[5-7]\d{8}$/.test(digits)) {
    return `+${digits}`
  }

  if (/^0[5-7]\d{8}$/.test(digits)) {
    return digits
  }

  // 9 digits without leading 0 (e.g. 710870270)
  if (/^[5-7]\d{8}$/.test(digits)) {
    return `0${digits}`
  }

  return digits
}

/** Formats acceptés après normalisation. */
export const MOROCCO_PHONE_REGEX = /^(?:\+212|0)[5-7]\d{8}$/
