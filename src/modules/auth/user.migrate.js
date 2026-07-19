import { User } from './user.model.js'

/**
 * Migration one-shot : remplace le rôle legacy `creator` par `client` en base.
 * Idempotente — ne touche que les documents qui contiennent encore `creator`.
 * Une seule updateMany (pipeline) au lieu d'un save() par document.
 * @returns {Promise<number>} nombre d'utilisateurs mis à jour
 */
export async function migrateLegacyCreatorRoles() {
  const result = await User.updateMany(
    { roles: 'creator' },
    [
      {
        $set: {
          roles: {
            $setUnion: [
              {
                $map: {
                  input: '$roles',
                  in: { $cond: [{ $eq: ['$$this', 'creator'] }, 'client', '$$this'] },
                },
              },
              [],
            ],
          },
        },
      },
    ],
    { updatePipeline: true }
  )
  return result.modifiedCount || 0
}

/**
 * Backfill `isActive: true` pour les comptes créés avant l’ajout du champ
 * (sinon `{ isActive: true }` ne les matche pas en Mongo).
 * @returns {Promise<number>}
 */
export async function migrateMissingIsActive() {
  const result = await User.updateMany(
    { isActive: { $exists: false } },
    { $set: { isActive: true } }
  )
  return result.modifiedCount || 0
}
