/**
 * Règles métier du programme de fidélité TonPrint.
 * Aligné sur le copy marketing : +50 pts à chaque palier de 10 ventes livrées.
 */
export const MILESTONE_SIZE = 10
export const POINTS_PER_MILESTONE = 50

/** Préfixe d'idempotence pour les crédits de paliers. */
export function milestoneIdempotencyKey(designId, milestoneUnits) {
  return `milestone:${designId}:${milestoneUnits}`
}
