import { User, normalizeRoles } from './user.model.js'

/**
 * Migration one-shot : remplace le rôle legacy `creator` par `client` en base.
 * Idempotente — ne touche que les documents qui contiennent encore `creator`.
 * @returns {Promise<number>} nombre d'utilisateurs mis à jour
 */
export async function migrateLegacyCreatorRoles() {
  const users = await User.find({ roles: 'creator' }).select('roles')
  if (!users.length) return 0

  let updated = 0
  for (const user of users) {
    user.roles = normalizeRoles(user.roles)
    await user.save()
    updated += 1
  }

  return updated
}
