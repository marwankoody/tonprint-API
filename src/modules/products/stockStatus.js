/**
 * Seuils et helpers stock (couleur × taille).
 * Miroir conceptuel du FE : `marketplace/utils/stockStatus.js`.
 */

export const LOW_STOCK_THRESHOLD = 5

/**
 * Quantité vendable d'une case matrice.
 * @param {{ quantity?: number } | null | undefined} cell
 */
export function sellableQuantity(cell) {
  if (!cell) return 0
  return Math.max(0, Number(cell.quantity) || 0)
}

/**
 * @param {object[]} stockByOption
 * @param {string} [colorName]
 * @param {string} [sizeLabel]
 */
export function findStockOption(stockByOption, colorName = '', sizeLabel = '') {
  if (!Array.isArray(stockByOption) || !stockByOption.length) return null
  const color = colorName || ''
  const size = sizeLabel || ''
  return (
    stockByOption.find((c) => (c.colorName || '') === color && (c.sizeLabel || '') === size) ||
    null
  )
}

/**
 * Recalcule `product.stock` et `variants[].stock` à partir de `stockByOption`.
 * No-op si la matrice est vide (stock manuel inchangé).
 * @param {{ stockByOption?: object[], variants?: object[], stock?: number }} data
 */
export function syncAggregatedStock(data) {
  const cells = Array.isArray(data.stockByOption) ? data.stockByOption : []
  if (!cells.length) return data

  const bySize = new Map()
  let total = 0
  for (const cell of cells) {
    const qty = sellableQuantity(cell)
    total += qty
    const size = cell.sizeLabel || ''
    if (size) bySize.set(size, (bySize.get(size) || 0) + qty)
  }

  const variants = (data.variants || []).map((v) => ({
    ...v,
    stock: bySize.has(v.label) ? bySize.get(v.label) : v.stock,
  }))

  return {
    ...data,
    stock: total,
    variants,
  }
}
