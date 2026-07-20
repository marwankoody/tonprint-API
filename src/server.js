import 'dotenv/config'
import { env } from './config/env.js'
import { connectDB, ensureIndexes } from './config/db.js'
import { migrateLegacyCreatorRoles, migrateMissingIsActive } from './modules/auth/user.migrate.js'
import { migrateProductCategories } from './modules/products/product.migrate.js'
import { startNotificationCleanupScheduler } from './modules/notifications/notification.cleanup.js'
import app from './app.js'

async function bootstrap() {
  try {
    await connectDB()

    const migrated = await migrateLegacyCreatorRoles()
    if (migrated > 0) {
      console.log(`✅ Migrated ${migrated} user(s): removed legacy "creator" role → "client"`)
    }

    const activated = await migrateMissingIsActive()
    if (activated > 0) {
      console.log(`✅ Backfilled isActive=true on ${activated} user(s)`)
    }

    const productsMigrated = await migrateProductCategories()
    if (productsMigrated > 0) {
      console.log(`✅ Migrated ${productsMigrated} product(s) to category + subcategory`)
    }

    // ensureIndexes sync les index dès qu'un modèle est enregistré (via import des routes).
    await ensureIndexes()

    startNotificationCleanupScheduler()

    app.listen(env.PORT, () => {
      console.log(`TonPrint API running on http://localhost:${env.PORT}`)
      console.log(`   env: ${env.NODE_ENV}`)
    })
  } catch (err) {
    console.error('Failed to start server:', err.message)
    process.exit(1)
  }
}

bootstrap()
