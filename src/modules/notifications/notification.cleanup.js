import { purgeExpiredNotifications } from './notification.service.js'

/** Intervalle de purge : toutes les 6 heures. */
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000

/**
 * Lance la purge au démarrage puis périodiquement.
 * @returns {() => void} stop
 */
export function startNotificationCleanupScheduler() {
  const run = () => {
    void purgeExpiredNotifications()
      .then(({ deletedRead, deletedUnread }) => {
        if (deletedRead > 0 || deletedUnread > 0) {
          console.log(
            `[notifications] purged expired — read: ${deletedRead}, unread: ${deletedUnread}`
          )
        }
      })
      .catch((err) => {
        console.error('[notifications] purge failed:', err?.message || err)
      })
  }

  run()
  const timer = setInterval(run, CLEANUP_INTERVAL_MS)
  if (typeof timer.unref === 'function') timer.unref()

  return () => clearInterval(timer)
}
