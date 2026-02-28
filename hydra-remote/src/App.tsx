import { useState, useCallback } from 'react'
import { Scanner } from './components/Scanner'
import { AgentList } from './components/AgentList'
import { AgentChat } from './components/AgentChat'
import { useRemoteSession } from './hooks/useRemoteSession'

type View = 'scan' | 'agents' | 'chat'

export default function App() {
  const {
    connected,
    connecting,
    error,
    agents,
    messages,
    connect,
    sendCommand,
    disconnect
  } = useRemoteSession()

  const [view, setView] = useState<View>('scan')
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  const handleScan = useCallback(
    async (data: string) => {
      await connect(data)
      setView('agents')
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

  const selectedAgent = agents.find((a) => a.agentId === selectedAgentId)

  // Scan view
  if (!connected && view === 'scan') {
    return (
      <div style={appStyle}>
        <div style={topBarStyle}>
          <span style={titleStyle}>Hydra Remote</span>
        </div>

        {connecting && (
          <div style={centerStyle}>
            <div style={spinnerStyle} />
            <p style={{ color: '#a0a0a0' }}>Connecting...</p>
          </div>
        )}

        {!connecting && <Scanner onScan={handleScan} />}

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
        messages={messages}
        onSendPrompt={handleSendPrompt}
        onBack={() => setView('agents')}
      />
    )
  }

  // Agent list view
  return (
    <div style={appStyle}>
      <div style={topBarStyle}>
        <span style={titleStyle}>Hydra Remote</span>
        <button style={disconnectBtnStyle} onClick={() => { disconnect(); setView('scan') }}>
          Disconnect
        </button>
      </div>

      <AgentList
        agents={agents}
        onSelect={handleSelectAgent}
        onKill={handleKill}
        onRestart={handleRestart}
      />
    </div>
  )
}

const appStyle: React.CSSProperties = {
  minHeight: '100dvh',
  background: '#191919',
  display: 'flex',
  flexDirection: 'column'
}

const topBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 16px 12px',
  borderBottom: '1px solid #333'
}

const titleStyle: React.CSSProperties = {
  fontSize: '1.125rem',
  fontWeight: 600,
  color: '#e8e8e8',
  letterSpacing: '0.04em'
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
  borderRadius: 6,
  border: '1px solid #f87171',
  color: '#f87171',
  background: 'transparent',
  cursor: 'pointer'
}
