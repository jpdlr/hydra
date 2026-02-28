import { Notification, BrowserWindow } from 'electron'
import { IPC } from '@shared/types'
import { DaemonNotificationService } from '../daemon/DaemonNotificationService'
import type { HydraNotification } from '@shared/types'

/**
 * Electron-specific notification service.
 * Extends DaemonNotificationService to add native OS notifications
 * and IPC broadcasts to renderer windows.
 */
export class NotificationService extends DaemonNotificationService {
  push(notification: HydraNotification): void {
    // Native OS notification
    if (Notification.isSupported()) {
      const native = new Notification({
        title: notification.title,
        body: notification.body,
        silent: true
      })
      native.show()
    }

    // Broadcast to renderer windows
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IPC.NOTIFICATION, notification)
    })

    // Delegate to base (stores in recent + notifies SSE subscribers)
    super.push(notification)
  }
}
