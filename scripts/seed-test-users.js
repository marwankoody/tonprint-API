/**
 * Seed de comptes de test (dev uniquement).
 * Usage: node scripts/seed-test-users.js
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { env } from '../src/config/env.js'
import { User } from '../src/modules/auth/user.model.js'

const TEST_USERS = [
  {
    name: 'Client Test',
    email: 'client@tonprint.ma',
    password: 'Client123!',
    roles: ['client'],
  },
  {
    name: 'Créateur Test',
    email: 'creator@tonprint.ma',
    password: 'Creator123!',
    roles: ['client', 'creator'],
  },
  {
    name: 'Admin Test',
    email: 'admin@tonprint.ma',
    password: 'Admin123!',
    roles: ['admin'],
  },
]

async function main() {
  await mongoose.connect(env.MONGODB_URI)

  for (const account of TEST_USERS) {
    const passwordHash = await bcrypt.hash(account.password, 12)
    await User.findOneAndUpdate(
      { email: account.email },
      {
        name: account.name,
        email: account.email,
        password: passwordHash,
        roles: account.roles,
        pointsBalance: account.roles.includes('creator') ? 150 : 0,
        refreshTokenHash: null,
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    )
    console.log(`✅ ${account.email} (${account.roles.join(', ')})`)
  }

  await mongoose.disconnect()
  console.log('\nComptes de test prêts.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
