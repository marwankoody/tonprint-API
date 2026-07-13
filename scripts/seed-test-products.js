/**
 * Seed de produits de test (dev uniquement).
 * Images Unsplash réalistes par catégorie (plusieurs vues par produit pour la galerie).
 * Usage: node scripts/seed-test-products.js
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import { env } from '../src/config/env.js'
import { Product } from '../src/modules/products/product.model.js'

/** @param {string} id @param {string} slug */
function unsplashImage(id, slug, isPrimary = false) {
  return {
    url: `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=80`,
    publicId: `unsplash/${slug}`,
    isPrimary,
  }
}

const TEST_PRODUCTS = [
  {
    name: 'T-shirt Premium Coton',
    category: 't-shirts',
    description: 'T-shirt 100% coton, idéal pour la personnalisation print on demand.',
    printType: 'DTG print',
    price: 149,
    compareAtPrice: 169,
    wholesalePrice: 129,
    wholesaleMoq: 30,
    stock: 100,
    isPublished: true,
    images: [
      unsplashImage('photo-1521572163474-6864f9cf17ab', 'tshirt-premium-1', true),
      unsplashImage('photo-1521369909029-2afed882baee', 'tshirt-premium-2'),
      unsplashImage('photo-1562408590-e32931084e23', 'tshirt-premium-3'),
    ],
    colors: [
      { name: 'Blanc', hex: '#FFFFFF' },
      { name: 'Noir', hex: '#111111' },
      { name: 'Orange', hex: '#FD6C01' },
    ],
    variants: [
      { label: 'S', stock: 25 },
      { label: 'M', stock: 30 },
      { label: 'L', stock: 25 },
      { label: 'XL', stock: 20 },
      { label: 'XXL', stock: 10 },
    ],
    popularity: 42,
  },
  {
    name: 'T-shirt Col Rond Basique',
    category: 't-shirts',
    description: 'T-shirt col rond coupe classique, coton peigné doux, base idéale pour vos designs.',
    printType: 'Sérigraphie',
    price: 99,
    compareAtPrice: 119,
    wholesalePrice: 79,
    wholesaleMoq: 50,
    stock: 140,
    isPublished: true,
    images: [
      unsplashImage('photo-1503341504253-dff4815485f1', 'tshirt-basique-1', true),
      unsplashImage('photo-1626785774573-4b799315345d', 'tshirt-basique-2'),
    ],
    colors: [
      { name: 'Blanc', hex: '#FFFFFF' },
      { name: 'Gris', hex: '#9CA3AF' },
      { name: 'Bleu marine', hex: '#1E3A5F' },
    ],
    variants: [
      { label: 'S', stock: 30 },
      { label: 'M', stock: 40 },
      { label: 'L', stock: 40 },
      { label: 'XL', stock: 30 },
    ],
    popularity: 31,
  },
  {
    name: 'Hoodie Unisexe',
    category: 'hoodies',
    description: 'Sweat à capuche confortable, coupe moderne, parfait pour vos designs.',
    printType: 'DTG print',
    price: 299,
    compareAtPrice: 349,
    wholesalePrice: 259,
    wholesaleMoq: 20,
    stock: 60,
    isPublished: true,
    images: [
      unsplashImage('photo-1556821840-3a63f95609a7', 'hoodie-unisexe-1', true),
      unsplashImage('photo-1620799140408-edc6dcb6d633', 'hoodie-unisexe-2'),
    ],
    colors: [
      { name: 'Noir', hex: '#111111' },
      { name: 'Gris', hex: '#9CA3AF' },
    ],
    variants: [
      { label: 'M', stock: 20 },
      { label: 'L', stock: 20 },
      { label: 'XL', stock: 20 },
    ],
    popularity: 28,
  },
  {
    name: 'Mug Céramique 330ml',
    category: 'mugs',
    description: 'Mug blanc brillant, résistant au lave-vaisselle.',
    printType: 'Sublim print',
    price: 79,
    compareAtPrice: 89,
    wholesalePrice: 65,
    wholesaleMoq: 50,
    stock: 200,
    isPublished: true,
    images: [
      unsplashImage('photo-1514228742587-6b1558fcca3d', 'mug-ceramique-1', true),
      unsplashImage('photo-1523381210434-271e8be1f52b', 'mug-ceramique-2'),
    ],
    colors: [{ name: 'Blanc', hex: '#FFFFFF' }],
    popularity: 15,
  },
  {
    name: 'Casquette Brodable',
    category: 'caps',
    description: 'Casquette structurée, zone de broderie/impression frontale.',
    printType: 'Broderie',
    price: 119,
    compareAtPrice: 139,
    wholesalePrice: 99,
    wholesaleMoq: 30,
    stock: 80,
    isPublished: true,
    isPointsRedeemable: true,
    pointsCost: 500,
    images: [unsplashImage('photo-1588850561407-ed78c282e89b', 'casquette-brodable-1', true)],
    colors: [
      { name: 'Noir', hex: '#111111' },
      { name: 'Marine', hex: '#1E3A5F' },
      { name: 'Blanc', hex: '#FFFFFF' },
    ],
    variants: [{ label: 'Unique', stock: 80 }],
    popularity: 8,
  },
  {
    name: 'Tote Bag Écologique',
    category: 'tote-bags',
    description: "Sac en coton bio, grande surface d'impression.",
    printType: 'Sérigraphie',
    price: 89,
    compareAtPrice: 99,
    wholesalePrice: 75,
    wholesaleMoq: 40,
    stock: 150,
    isPublished: true,
    images: [
      unsplashImage('photo-1597484662317-9bd7bdda2907', 'tote-bag-eco-1', true),
      unsplashImage('photo-1583743814966-8936f5b7be1a', 'tote-bag-eco-2'),
    ],
    colors: [
      { name: 'Naturel', hex: '#F5F0E8' },
      { name: 'Noir', hex: '#111111' },
    ],
    variants: [{ label: 'Unique', stock: 150 }],
    popularity: 12,
  },
]

async function main() {
  await mongoose.connect(env.MONGODB_URI)

  for (const item of TEST_PRODUCTS) {
    await Product.findOneAndUpdate(
      { name: item.name },
      item,
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    )
    console.log(`✅ ${item.name} (${item.isPublished ? 'publié' : 'brouillon'})`)
  }

  const published = await Product.countDocuments({ isPublished: true })
  console.log(`\n${published} produit(s) publié(s) visibles sur GET /api/products`)

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
