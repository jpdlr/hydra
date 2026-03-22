import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/tokens.css'

const UPDATE_CHECK_INTERVAL_MS = 60_000
const SW_VERSION = '20260322-remote-sync-1'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    let hardReloadPending = false

    const promoteWaitingWorker = (registration: ServiceWorkerRegistration): boolean => {
      if (!registration.waiting || !navigator.serviceWorker.controller) return false
      hardReloadPending = true
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      return true
    }

    const bindInstallingWorker = (registration: ServiceWorkerRegistration) => {
      const installingWorker = registration.installing
      if (!installingWorker) return

      installingWorker.addEventListener('statechange', () => {
        if (installingWorker.state !== 'installed') return
        promoteWaitingWorker(registration)
      })
    }

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register(`/sw.js?v=${SW_VERSION}`, {
          scope: '/',
          updateViaCache: 'none'
        })

        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!hardReloadPending) return
          hardReloadPending = false
          window.location.reload()
        })

        registration.addEventListener('updatefound', () => {
          bindInstallingWorker(registration)
        })

        const checkForUpdate = () => {
          registration.update().catch((err) => {
            console.error('Service worker update check failed:', err)
          })
        }

        bindInstallingWorker(registration)
        if (!promoteWaitingWorker(registration)) {
          checkForUpdate()
        }

        window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS)
        window.addEventListener('focus', checkForUpdate)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            checkForUpdate()
          }
        })
      } catch (err) {
        console.error('Service worker registration failed:', err)
      }
    }

    void registerServiceWorker()
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
