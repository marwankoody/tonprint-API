import 'dotenv/config'
import { env } from './config/env.js'
import { connectDB, ensureIndexes } from './config/db.js'
import app from './app.js'

async function bootstrap() {
  try {
    await connectDB()
    // Les modèles seront importés ici au fur et à mesure des phases.
    // ensureIndexes sync les index dès qu'un modèle est enregistré.
    await ensureIndexes()

    app.listen(env.PORT, () => {
      console.log(`🚀 TonPrint API running on http://localhost:${env.PORT}`)
      console.log(`   env: ${env.NODE_ENV}`)
    })
  } catch (err) {
    console.error('❌ Failed to start server:', err.message)
    process.exit(1)
  }
}

bootstrap()
