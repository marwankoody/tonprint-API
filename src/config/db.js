import mongoose from 'mongoose'
import { env } from './env.js'

/**
 * Établit la connexion MongoDB via Mongoose.
 * @returns {Promise<typeof mongoose>}
 */
export async function connectDB() {
  mongoose.set('strictQuery', true)

  await mongoose.connect(env.MONGODB_URI)

  console.log(`✅ MongoDB connected: ${mongoose.connection.name}`)
  return mongoose
}

/**
 * Vérifie au démarrage que les index Mongoose sont bien synchronisés.
 * À appeler après le chargement des modèles (import des schemas).
 * @returns {Promise<void>}
 */
export async function ensureIndexes() {
  const models = mongoose.modelNames()

  if (models.length === 0) {
    console.log('ℹ️  No Mongoose models registered yet — index check skipped')
    return
  }

  for (const name of models) {
    const model = mongoose.model(name)
    await model.syncIndexes()
    const indexes = await model.collection.indexes()
    console.log(`✅ Indexes synced for "${name}" (${indexes.length})`)
  }
}
