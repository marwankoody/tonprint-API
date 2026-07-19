import mongoose from 'mongoose'
import { env } from './env.js'

const isProd = env.NODE_ENV === 'production'

/**
 * Établit la connexion MongoDB via Mongoose.
 * @returns {Promise<typeof mongoose>}
 */
export async function connectDB() {
  mongoose.set('strictQuery', true)

  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: 20,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
  })

  console.log(`✅ MongoDB connected: ${mongoose.connection.name}`)
  return mongoose
}

/**
 * Vérifie au démarrage que les index Mongoose sont bien synchronisés.
 * À appeler après le chargement des modèles (import des schemas).
 *
 * En production, utilise `createIndexes()` (additif uniquement) pour éviter
 * qu'un déploiement ne supprime silencieusement un index existant en base
 * suite à un schéma temporairement désynchronisé. `syncIndexes()` (destructif,
 * supprime les index absents du schéma courant) reste réservé au développement,
 * où l'itération rapide sur les schémas est plus fréquente.
 * @returns {Promise<void>}
 */
export async function ensureIndexes() {
  const models = mongoose.modelNames()

  if (models.length === 0) {
    console.log('ℹ️  No Mongoose models registered yet — index check skipped')
    return
  }

  await Promise.all(
    models.map(async (name) => {
      const model = mongoose.model(name)
      if (isProd) {
        await model.createIndexes()
      } else {
        await model.syncIndexes()
      }
      const indexes = await model.collection.indexes()
      console.log(`✅ Indexes synced for "${name}" (${indexes.length})`)
    })
  )
}
