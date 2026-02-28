import { useState, useRef, useEffect, useMemo } from 'react'

interface OutboxMessage {
  id: string
  type: 'output' | 'status' | 'notification' | 'agent_list'
  payload: Record<string, unknown>
  timestamp: string
}

interface AgentChatProps {
  agentId: string
  agentName: string
  agentStatus: string
  messages: OutboxMessage[]
  onSendPrompt: (input: string) => void
  onBack: () => void
}

export function AgentChat({
  agentId,
  agentName,
  agentStatus,
  messages,
  onSendPrompt,
  onBack
}: AgentChatProps) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Filter messages for this agent
  const agentMessages = useMemo(() => {
    return messages.filter((msg) => {
      const payload = msg.payload
      return (
        (msg.type === 'output' && payload.agentId === agentId) ||
        (msg.type === 'status' && payload.agentId === agentId) ||
        (msg.type === 'notification' && payload.agentId === agentId)
      )
    })
  }, [messages, agentId])

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [agentMessages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    onSendPrompt(trimmed)
    setInput('')
  }

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <button style={backBtnStyle} onClick={onBack}>
          ←
        </button>
        <div style={headerInfoStyle}>
          <span style={headerNameStyle}>{agentName}</span>
          <span style={headerStatusStyle(agentStatus)}>{agentStatus}</span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={messagesStyle}>
        {agentMessages.map((msg, i) => (
          <div key={msg.id || i} style={messageBubbleStyle(msg.type)}>
            {msg.type === 'output' && (
              <pre style={outputStyle}>
                {Array.isArray(msg.payload.lines)
                  ? (msg.payload.lines as string[]).join('')
                  : String(msg.payload.data ?? '')}
              </pre>
            )}
            {msg.type === 'status' && (
              <span style={statusMsgStyle}>
                Status changed to {String(msg.payload.status)}
              </span>
            )}
            {msg.type === 'notification' && (
              <span style={notifStyle}>
                {String(msg.payload.title)}: {String(msg.payload.body)}
              </span>
            )}
          </div>
        ))}

        {agentMessages.length === 0 && (
          <div style={emptyMsgStyle}>
            No messages yet. Send a prompt to get started.
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={inputFormStyle}>
        <input
          style={inputStyle}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Send a prompt..."
          autoFocus
        />
        <button type="submit" style={sendBtnStyle} disabled={!input.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}

function headerStatusStyle(status: string): React.CSSProperties {
  const colors: Record<string, string> = {
    running: '#4ade80',
    idle: '#a0a0a0',
    errored: '#f87171',
    starting: '#fbbf24'
  }
  return {
    fontSize: '0.6875rem',
    color: colors[status] || '#666'
  }
}

function messageBubbleStyle(type: string): React.CSSProperties {
  return {
    padding: type === 'output' ? '8px 12px' : '6px 12px',
    borderRadius: 8,
    background: type === 'output' ? '#2a2a2a' : 'transparent',
    maxWidth: '100%',
    overflowX: 'auto'
  }
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100dvh',
  background: '#191919'
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 16px',
  borderBottom: '1px solid #333',
  flexShrink: 0
}

const backBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#e8e8e8',
  fontSize: '1.25rem',
  cursor: 'pointer',
  padding: '4px 8px'
}

const headerInfoStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2
}

const headerNameStyle: React.CSSProperties = {
  fontSize: '0.9375rem',
  fontWeight: 600,
  color: '#e8e8e8'
}

const messagesStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '12px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6
}

const outputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.6875rem',
  lineHeight: 1.5,
  color: '#e8e8e8',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  margin: 0
}

const statusMsgStyle: React.CSSProperties = {
  fontSize: '0.6875rem',
  color: '#666',
  fontStyle: 'italic'
}

const notifStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#fbbf24'
}

const emptyMsgStyle: React.CSSProperties = {
  textAlign: 'center',
  color: '#666',
  fontSize: '0.8125rem',
  padding: 40
}

const inputFormStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: '12px 16px',
  borderTop: '1px solid #333',
  flexShrink: 0
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 14px',
  background: '#232323',
  border: '1px solid #333',
  borderRadius: 8,
  color: '#e8e8e8',
  fontSize: '0.875rem',
  outline: 'none'
}

const sendBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  background: '#e8e8e8',
  color: '#191919',
  border: 'none',
  borderRadius: 8,
  fontWeight: 600,
  fontSize: '0.875rem',
  cursor: 'pointer'
}
