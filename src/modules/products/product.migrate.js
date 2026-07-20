import {
  Product,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_TREE,
  isValidCategoryPair,
} from './product.model.js'

/**
 * Mapping des anciennes catégories plates → parent + sous-catégorie par défaut.
 */
const LEGACY_CATEGORY_MAP = {
  't-shirts': { category: 't-shirts', subcategory: 'regular-t-shirt' },
  hoodies: { category: 'hoodies-sweatshirts', subcategory: 'unisex-hoodie' },
  caps: { category: 'headwear', subcategory: 'hats' },
  'tote-bags': { category: 'accessories', subcategory: 'tote-bags' },
  mugs: { category: 'home-living', subcategory: 'mugs' },
  uniforms: { category: 't-shirts', subcategory: 'regular-t-shirt' },
}

const MISSING_SUBCATEGORY = [
  { subcategory: { $exists: false } },
  { subcategory: null },
  { subcategory: '' },
]

/**
 * Migre les produits vers category + subcategory.
 * Idempotente : ne réécrit pas un couple déjà valide.
 * @returns {Promise<number>} nombre de documents mis à jour
 */
export async function migrateProductCategories() {
  let updated = 0

  // 1) Anciennes valeurs plates → nouveau couple
  for (const [legacy, next] of Object.entries(LEGACY_CATEGORY_MAP)) {
    if (legacy !== next.category) {
      const renamed = await Product.updateMany(
        { category: legacy },
        { $set: { category: next.category, subcategory: next.subcategory } }
      )
      updated += renamed.modifiedCount || 0
    } else {
      const filled = await Product.updateMany(
        { category: legacy, $or: MISSING_SUBCATEGORY },
        { $set: { subcategory: next.subcategory } }
      )
      updated += filled.modifiedCount || 0
    }
  }

  // 2) Parents valides sans subcategory → 1er enfant
  for (const [category, children] of Object.entries(PRODUCT_CATEGORY_TREE)) {
    const result = await Product.updateMany(
      { category, $or: MISSING_SUBCATEGORY },
      { $set: { subcategory: children[0] } }
    )
    updated += result.modifiedCount || 0
  }

  // 3) Couples invalides restants (scan ciblé)
  const candidates = await Product.find({
    $or: [
      ...MISSING_SUBCATEGORY,
      { category: { $nin: PRODUCT_CATEGORIES } },
    ],
  })
    .select('_id category subcategory')
    .lean()

  for (const doc of candidates) {
    if (isValidCategoryPair(doc.category, doc.subcategory)) continue
    const fallback =
      LEGACY_CATEGORY_MAP[doc.category] ||
      (PRODUCT_CATEGORY_TREE[doc.category]
        ? { category: doc.category, subcategory: PRODUCT_CATEGORY_TREE[doc.category][0] }
        : LEGACY_CATEGORY_MAP['t-shirts'])
    await Product.updateOne(
      { _id: doc._id },
      { $set: { category: fallback.category, subcategory: fallback.subcategory } }
    )
    updated += 1
  }

  return updated
}
