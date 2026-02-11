import type { HydraNotification, NotificationType } from '@shared/types'
import styles from './NotificationToast.module.css'

interface NotificationToastProps {
  notifications: HydraNotification[]
  onDismiss: (id: string) => void
}

function getVariant(type: NotificationType): 'success' | 'error' | 'info' | 'warning' {
  switch (type) {
    case 'agent_idle':
    case 'agent_waiting':
    case 'headless_completed':
      return 'success'
    case 'agent_errored':
    case 'headless_errored':
      return 'error'
    case 'usage_budget_warning':
      return 'warning'
    case 'agent_started':
      return 'info'
  }
}

export function NotificationToast({ notifications, onDismiss }: NotificationToastProps) {
  if (notifications.length === 0) return null

  return (
    <div className={styles.container}>
      {notifications.map((n) => {
        const variant = getVariant(n.type)
        return (
          <div key={n.id} className={`${styles.toast} ${styles[variant]}`}>
            <div className={`${styles.icon} ${styles[variant]}`} />
            <div className={styles.content}>
              <p className={styles.title}>{n.title}</p>
              <p className={styles.body}>{n.body}</p>
            </div>
            <button
              className={styles.dismiss}
              onClick={() => onDismiss(n.id)}
              aria-label="Dismiss notification"
            >
              &times;
            </button>
          </div>
        )
      })}
    </div>
  )
}
