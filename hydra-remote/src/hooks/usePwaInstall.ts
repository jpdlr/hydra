import { useCallback, useEffect, useMemo, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const INSTALL_DISMISSED_KEY = 'hydra-remote:pwa-install-dismissed'

function isStandaloneDisplay(): boolean {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    navigatorWithStandalone.standalone === true
  )
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent.toLowerCase()
  const isIos = /iphone|ipad|ipod/.test(ua)
  const isWebKit = /webkit/.test(ua)
  const isOtherBrowser = /crios|fxios|edgios/.test(ua)
  return isIos && isWebKit && !isOtherBrowser
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() => isStandaloneDisplay())
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(INSTALL_DISMISSED_KEY) === '1')
  const iosSafari = useMemo(() => isIosSafari(), [])
  const iosWebKit = useMemo(() => /iphone|ipad|ipod/i.test(navigator.userAgent), [])

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    const onInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
      setDismissed(true)
      localStorage.setItem(INSTALL_DISMISSED_KEY, '1')
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const canInstall = useMemo(() => !installed && !!deferredPrompt, [installed, deferredPrompt])
  const showIosHint = useMemo(() => !installed && !deferredPrompt && iosSafari, [installed, deferredPrompt, iosSafari])
  const showManualHint = useMemo(
    () => !installed && !deferredPrompt && !iosSafari && !iosWebKit,
    [installed, deferredPrompt, iosSafari, iosWebKit]
  )
  const showInstallCard = useMemo(() => !dismissed && !installed, [dismissed, installed])

  const dismissInstallCard = useCallback(() => {
    setDismissed(true)
    localStorage.setItem(INSTALL_DISMISSED_KEY, '1')
  }, [])

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable'

    await deferredPrompt.prompt()
    const result = await deferredPrompt.userChoice

    if (result.outcome === 'accepted') {
      setInstalled(true)
      setDismissed(true)
      localStorage.setItem(INSTALL_DISMISSED_KEY, '1')
    }

    setDeferredPrompt(null)
    return result.outcome
  }, [deferredPrompt])

  return {
    installed,
    canInstall,
    iosSafari,
    iosWebKit,
    showIosHint,
    showManualHint,
    showInstallCard,
    install,
    dismissInstallCard
  }
}
