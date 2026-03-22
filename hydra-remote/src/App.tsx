import { useState, useCallback, useEffect } from 'react'
import { Scanner } from './components/Scanner'
import { AgentList } from './components/AgentList'
import { AgentChat } from './components/AgentChat'
import { useRemoteSession } from './hooks/useRemoteSession'
import { usePwaInstall } from './hooks/usePwaInstall'

type View = 'scan' | 'agents' | 'chat'

export default function App() {
  const {
    connected,
    connecting,
    restoringSession,
    error,
    agents,
    messages,
    sessionId,
    connect,
    sendCommand,
    disconnect
  } = useRemoteSession()

  const [view, setView] = useState<View>('scan')
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [forceShowInstall, setForceShowInstall] = useState(false)
  const [copiedHint, setCopiedHint] = useState<string | null>(null)
  const [installStatus, setInstallStatus] = useState<string | null>(null)
  const {
    installed,
    canInstall,
    iosSafari,
    iosWebKit,
    showIosHint,
    showManualHint,
    showInstallCard,
    install,
    dismissInstallCard
  } = usePwaInstall()

  const shouldShowInstall = !installed && (forceShowInstall || showInstallCard)

  useEffect(() => {
    if (!installStatus) return
    const timer = window.setTimeout(() => setInstallStatus(null), 4000)
    return () => window.clearTimeout(timer)
  }, [installStatus])

  const handleScan = useCallback(
    async (data: string) => {
      const connectedNow = await connect(data)
      if (connectedNow) {
        setView('agents')
      }
    },
    [connect]
  )

  const handleSelectAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId)
    setView('chat')
  }, [])

  const handleSendPrompt = useCallback(
    (input: string) => {
      if (!selectedAgentId) return
      void sendCommand('prompt', { agentId: selectedAgentId, input })
    },
    [selectedAgentId, sendCommand]
  )

  const handleKill = useCallback(
    (agentId: string) => {
      void sendCommand('kill', { agentId })
    },
    [sendCommand]
  )

  const handleRestart = useCallback(
    (agentId: string) => {
      void sendCommand('restart', { agentId })
    },
    [sendCommand]
  )

  const handleCopyInstallLink = useCallback(() => {
    const href = window.location.href
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(href)
        .then(() => {
          setCopiedHint('Link copied. Open Safari and paste it there.')
          setInstallStatus('Open Safari, paste the link, then use Share -> Add to Home Screen.')
          setForceShowInstall(true)
          setTimeout(() => setCopiedHint(null), 2500)
        })
        .catch(() => {
          window.prompt('Copy this link and open it in Safari:', href)
          setInstallStatus('Copy the link, open Safari, then use Share -> Add to Home Screen.')
          setForceShowInstall(true)
        })
      return
    }
    window.prompt('Copy this link and open it in Safari:', href)
    setInstallStatus('Copy the link, open Safari, then use Share -> Add to Home Screen.')
    setForceShowInstall(true)
  }, [])

  const handleInstallAction = useCallback(async () => {
    const outcome = await install()
    setForceShowInstall(true)

    if (outcome === 'accepted') {
      setInstallStatus('Hydra Remote installed.')
      return
    }

    if (outcome === 'dismissed') {
      setInstallStatus('Install prompt dismissed. Tap Install again when ready.')
      return
    }

    if (iosWebKit && !iosSafari) {
      setInstallStatus('iPhone Chrome cannot install directly. Use Copy Link and open in Safari.')
      return
    }

    if (showIosHint) {
      setInstallStatus('Use Safari Share -> Add to Home Screen.')
      return
    }

    if (showManualHint) {
      setInstallStatus('Open browser menu and choose Install App or Add to Home Screen.')
    }
  }, [install, iosWebKit, iosSafari, showIosHint, showManualHint])

  const handleInstallTopTap = useCallback(() => {
    if (canInstall) {
      void handleInstallAction()
      return
    }

    setForceShowInstall(true)

    if (iosWebKit && !iosSafari) {
      setInstallStatus('iPhone Chrome requires Safari for home-screen install.')
      return
    }

    if (showIosHint) {
      setInstallStatus('Use Safari Share -> Add to Home Screen.')
      return
    }

    if (showManualHint) {
      setInstallStatus('Open browser menu and choose Install App or Add to Home Screen.')
    }
  }, [canInstall, handleInstallAction, iosWebKit, iosSafari, showIosHint, showManualHint])

  const selectedAgent = agents.find((a) => a.agentId === selectedAgentId)

  useEffect(() => {
    if (selectedAgentId && !selectedAgent) {
      setSelectedAgentId(null)
      setView('agents')
    }
  }, [selectedAgentId, selectedAgent])

  useEffect(() => {
    if (!connected && !connecting && !restoringSession) {
      setSelectedAgentId(null)
      setView('scan')
    }
  }, [connected, connecting, restoringSession])

  // Scan view
  if (!connected && view === 'scan') {
    return (
      <div style={appStyle}>
        <div style={topBarStyle}>
          <div style={brandWrapStyle}>
            <img src="/icons/icon-192.png?v=20260301" alt="Hydra icon" style={brandIconStyle} />
            <span style={titleStyle}>Hydra Remote</span>
          </div>
          {!installed && (
            <button style={installTopBtnStyle} onClick={handleInstallTopTap}>
              Install
            </button>
          )}
        </div>

        {shouldShowInstall && (
          <InstallCard
            canInstall={canInstall}
            iosSafari={iosSafari}
            iosWebKit={iosWebKit}
            showIosHint={showIosHint}
            showManualHint={showManualHint}
            copiedHint={copiedHint}
            installStatus={installStatus}
            onInstall={() => { void handleInstallAction() }}
            onCopyLink={handleCopyInstallLink}
            onDismiss={() => {
              setForceShowInstall(false)
              dismissInstallCard()
            }}
          />
        )}

        {(restoringSession || connecting) && (
          <div style={centerStyle}>
            <div style={spinnerStyle} />
            <p style={{ color: '#a0a0a0' }}>{restoringSession ? 'Reconnecting...' : 'Connecting...'}</p>
          </div>
        )}

        {!restoringSession && !connecting && <Scanner onScan={handleScan} />}

        {error && (
          <p style={errorStyle}>{error}</p>
        )}
      </div>
    )
  }

  // Chat view
  if (view === 'chat' && selectedAgent) {
    return (
      <AgentChat
        agentId={selectedAgent.agentId}
        agentName={selectedAgent.name}
        agentStatus={selectedAgent.status}
        provider={selectedAgent.provider}
        remoteSessionId={sessionId}
        agentSessionId={selectedAgent.sessionId ?? null}
        messages={messages}
        onSendPrompt={handleSendPrompt}
        onSendCommand={sendCommand}
        onRestart={() => handleRestart(selectedAgent.agentId)}
        onBack={() => setView('agents')}
      />
    )
  }

  // Agent list view
  return (
    <div style={appStyle}>
        <div style={topBarStyle}>
          <div style={brandWrapStyle}>
            <img src="/icons/icon-192.png?v=20260301" alt="Hydra icon" style={brandIconStyle} />
            <span style={titleStyle}>Hydra Remote</span>
          </div>
          <div style={topBarActionsStyle}>
            {!installed && (
              <button style={installTopBtnStyle} onClick={handleInstallTopTap}>
                Install
              </button>
            )}
            <button style={disconnectBtnStyle} onClick={() => { disconnect(); setView('scan') }}>
              Disconnect
            </button>
          </div>
        </div>

      {shouldShowInstall && (
        <InstallCard
          canInstall={canInstall}
          iosSafari={iosSafari}
          iosWebKit={iosWebKit}
          showIosHint={showIosHint}
          showManualHint={showManualHint}
          copiedHint={copiedHint}
          installStatus={installStatus}
          onInstall={() => { void handleInstallAction() }}
          onCopyLink={handleCopyInstallLink}
          onDismiss={() => {
            setForceShowInstall(false)
            dismissInstallCard()
          }}
        />
      )}

      <AgentList
        agents={agents}
        onSelect={handleSelectAgent}
        onKill={handleKill}
        onRestart={handleRestart}
      />
    </div>
  )
}

interface InstallCardProps {
  canInstall: boolean
  iosSafari: boolean
  iosWebKit: boolean
  showIosHint: boolean
  showManualHint: boolean
  copiedHint: string | null
  installStatus: string | null
  onInstall: () => void
  onCopyLink: () => void
  onDismiss: () => void
}

function InstallCard({
  canInstall,
  iosSafari,
  iosWebKit,
  showIosHint,
  showManualHint,
  copiedHint,
  installStatus,
  onInstall,
  onCopyLink,
  onDismiss
}: InstallCardProps) {
  return (
    <div style={installCardStyle}>
      <div>
        <div style={installTitleStyle}>Install Hydra Remote</div>
        {canInstall && (
          <div style={installTextStyle}>
            Add it to your home screen for full-screen remote control.
          </div>
        )}
        {showIosHint && (
          <div style={installTextStyle}>
            On iPhone/iPad: tap Share, then choose Add to Home Screen.
          </div>
        )}
        {iosWebKit && !iosSafari && (
          <div style={installTextStyle}>
            iPhone Chrome: open this site in Safari, then tap Share and Add to Home Screen.
          </div>
        )}
        {copiedHint && (
          <div style={installCopiedStyle}>{copiedHint}</div>
        )}
        {installStatus && (
          <div style={installCopiedStyle}>{installStatus}</div>
        )}
        {showManualHint && (
          <div style={installTextStyle}>
            Open your browser menu and choose Install App or Add to Home Screen.
          </div>
        )}
      </div>
      <div style={installActionsStyle}>
        {canInstall && (
          <button style={installBtnStyle} onClick={onInstall}>
            Install
          </button>
        )}
        {iosWebKit && !iosSafari && (
          <button style={dismissBtnStyle} onClick={onCopyLink}>
            Copy Link
          </button>
        )}
        <button style={dismissBtnStyle} onClick={onDismiss}>
          Later
        </button>
      </div>
    </div>
  )
}

const appStyle: React.CSSProperties = {
  minHeight: '100dvh',
  background: '#191919',
  color: '#e8e8e8',
  display: 'flex',
  flexDirection: 'column'
}

const topBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 16px 12px',
  borderBottom: '1px solid #2a2a2a',
  background: '#191919'
}

const topBarActionsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8
}

const brandWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10
}

const brandIconStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.35)'
}

const titleStyle: React.CSSProperties = {
  fontSize: '1.125rem',
  fontWeight: 600,
  color: '#e8e8e8',
  letterSpacing: '0.01em'
}

const installCardStyle: React.CSSProperties = {
  margin: '12px 16px 6px',
  border: '1px solid #2a2a2a',
  borderRadius: 14,
  background: '#212121',
  padding: 12,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 10
}

const installTitleStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  color: '#ffffff',
  fontWeight: 700
}

const installTextStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: '0.75rem',
  color: '#a0a0a0',
  lineHeight: 1.4,
  maxWidth: 460
}

const installCopiedStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: '0.74rem',
  color: '#bff7cc'
}

const installActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  justifyContent: 'flex-end'
}

const installBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: '0.75rem',
  borderRadius: 8,
  border: '1px solid #ffffff',
  color: '#191919',
  background: '#e8e8e8',
  cursor: 'pointer',
  fontWeight: 600
}

const installTopBtnStyle: React.CSSProperties = {
  ...installBtnStyle,
  padding: '6px 10px'
}

const dismissBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: '0.75rem',
  borderRadius: 8,
  border: '1px solid #333333',
  color: '#a0a0a0',
  background: 'transparent',
  cursor: 'pointer'
}

const centerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 16,
  padding: 40
}

const spinnerStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  border: '3px solid #333',
  borderTopColor: '#e8e8e8',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite'
}

const errorStyle: React.CSSProperties = {
  color: '#f87171',
  fontSize: '0.8125rem',
  textAlign: 'center',
  padding: '0 20px'
}

const disconnectBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: '0.75rem',
  borderRadius: 8,
  border: '1px solid #f87171',
  color: '#fecaca',
  background: '#3b1014',
  cursor: 'pointer'
}
