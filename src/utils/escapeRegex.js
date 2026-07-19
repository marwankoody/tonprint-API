/**
 * Échappe les caractères spéciaux regex d'une saisie utilisateur
 * avant de la passer dans un `$regex` Mongo (anti ReDoS / injection regex).
 * @param {string} value
 */
export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
