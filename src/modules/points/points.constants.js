/**
 * Défauts du programme de fidélité TonPrint (utilisés à l'upsert Settings).
 * Les valeurs actives sont en DB (`PointsSettings`) et éditables via admin.
 */
export const MILESTONE_SIZE = 10
export const POINTS_PER_MILESTONE = 50

/** Préfixe d'idempotence pour les crédits de paliers. */
export function milestoneIdempotencyKey(designId, milestoneUnits) {
  return `milestone:${designId}:${milestoneUnits}`
}
