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
  onSendPrompt: (input: string) => void | Promise<void>
  onRestart: () => void
  onBack: () => void
}

type ChatRole = 'user' | 'assistant' | 'system'

interface ChatBubble {
  id: string
  role: ChatRole
  text: string
  timestamp: string
}

interface LocalUserMessage {
  id: string
  text: string
  timestamp: string
}

export function AgentChat({
  agentId,
  agentName,
  agentStatus,
  messages,
  onSendPrompt,
  onRestart,
  onBack
}: AgentChatProps) {
  const [input, setInput] = useState('')
  const [localUserMessages, setLocalUserMessages] = useState<LocalUserMessage[]>([])
  const [awaitingReplySince, setAwaitingReplySince] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Filter messages for this agent
  const agentMessages = useMemo(() => {
    return messages.filter((msg) => {
      const payload = msg.payload
      const payloadAgentId = getPayloadAgentId(payload)
      return (
        (msg.type === 'output' && payloadAgentId === agentId) ||
        (msg.type === 'status' && payloadAgentId === agentId) ||
        (msg.type === 'notification' && payloadAgentId === agentId)
      )
    })
  }, [messages, agentId])

  const remoteConversation = useMemo(() => {
    const completedReplies: ChatBubble[] = []
    const systemNotifications: ChatBubble[] = []
    let draftId: string | null = null
    let draftText = ''
    let draftStartedAt = ''
    let latestCompletedAt: string | null = null
    let latestTerminalStatusAt: string | null = null

    for (const msg of agentMessages) {
      if (msg.type === 'output') {
        const chunk = getOutputChunk(msg.payload)
        if (!chunk) continue

        if (!draftId) {
          draftId = `assistant-${msg.id}`
          draftStartedAt = msg.timestamp
        }

        draftText += chunk
        continue
      }

      if (msg.type === 'status') {
        const status = String(msg.payload.status ?? '')
        if (isTerminalStatus(status)) {
          latestTerminalStatusAt = msg.timestamp
          if (draftId) {
            const text = draftText.trim()
            if (text) {
              completedReplies.push({
                id: draftId,
                role: 'assistant',
                text: draftText,
                timestamp: msg.timestamp || draftStartedAt
              })
              latestCompletedAt = msg.timestamp || draftStartedAt
            }
            draftId = null
            draftText = ''
            draftStartedAt = ''
          }
        }
        continue
      }

      if (msg.type === 'notification') {
        const title = String(msg.payload.title ?? '').trim()
        const body = String(msg.payload.body ?? '').trim()
        const text = title && body ? `${title}: ${body}` : `${title}${body}`
        if (!text) continue

        systemNotifications.push({
          id: `notification-${msg.id}`,
          role: 'system',
          text,
          timestamp: msg.timestamp
        })
      }
    }

    let inProgressReply: ChatBubble | null = null
    if (draftId && draftText.trim()) {
      if (isTerminalStatus(agentStatus)) {
        completedReplies.push({
          id: draftId,
          role: 'assistant',
          text: draftText,
          timestamp: draftStartedAt
        })
        latestCompletedAt = draftStartedAt
      } else {
        inProgressReply = {
          id: `${draftId}-draft`,
          role: 'assistant',
          text: draftText,
          timestamp: draftStartedAt
        }
      }
    }

    return {
      completedReplies,
      inProgressReply,
      systemNotifications,
      latestCompletedAt,
      latestTerminalStatusAt
    }
  }, [agentMessages, agentStatus])

  const chatBubbles = useMemo(() => {
    const userBubbles: ChatBubble[] = localUserMessages.map((message) => ({
      id: message.id,
      role: 'user',
      text: message.text,
      timestamp: message.timestamp
    }))

    return [...userBubbles, ...remoteConversation.completedReplies, ...remoteConversation.systemNotifications]
      .sort((a, b) => {
        const timeCompare = a.timestamp.localeCompare(b.timestamp)
        if (timeCompare !== 0) return timeCompare
        return a.id.localeCompare(b.id)
      })
  }, [localUserMessages, remoteConversation.completedReplies, remoteConversation.systemNotifications])

  const isTyping = Boolean(awaitingReplySince || remoteConversation.inProgressReply)

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatBubbles, isTyping])

  useEffect(() => {
    if (!awaitingReplySince) return

    if (
      remoteConversation.latestCompletedAt &&
      remoteConversation.latestCompletedAt >= awaitingReplySince
    ) {
      setAwaitingReplySince(null)
      return
    }

    if (
      remoteConversation.latestTerminalStatusAt &&
      remoteConversation.latestTerminalStatusAt >= awaitingReplySince
    ) {
      setAwaitingReplySince(null)
    }
  }, [
    awaitingReplySince,
    remoteConversation.latestCompletedAt,
    remoteConversation.latestTerminalStatusAt
  ])

  useEffect(() => {
    setLocalUserMessages([])
    setAwaitingReplySince(null)
  }, [agentId])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    const timestamp = new Date().toISOString()
    setLocalUserMessages((prev) => [
      ...prev,
      {
        id: `local-${createLocalId()}`,
        text: trimmed,
        timestamp
      }
    ])
    setAwaitingReplySince(timestamp)
    void Promise.resolve(onSendPrompt(trimmed)).catch(() => {
      setAwaitingReplySince(null)
    })
    setInput('')
  }

  const statusText = getStatusBannerText(agentStatus)
  const showStatusBanner = statusText !== null
  const canRestart = agentStatus === 'idle' || agentStatus === 'errored'

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

      {showStatusBanner && (
        <div style={statusBannerStyle(agentStatus)}>
          <span>{statusText}</span>
          {canRestart && (
            <button type="button" style={statusBannerBtnStyle} onClick={onRestart}>
              {agentStatus === 'errored' ? 'Reconnect' : 'Restart'}
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} style={messagesStyle}>
        {chatBubbles.map((message) => (
          <div key={message.id} style={messageRowStyle(message.role)}>
            <div style={messageBubbleStyle(message.role)}>
              {message.role === 'assistant' ? (
                <pre style={assistantTextStyle}>{message.text}</pre>
              ) : (
                <span style={messageTextStyle(message.role)}>{message.text}</span>
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div style={messageRowStyle('assistant')}>
            <div style={typingBubbleStyle}>
              <span style={typingTextStyle}>Agent is typing...</span>
            </div>
          </div>
        )}

        {chatBubbles.length === 0 && !isTyping && (
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

function getStatusBannerText(status: string): string | null {
  if (status === 'starting') return 'Starting session...'
  if (status === 'idle') return 'Session is idle. Send a prompt or restart.'
  if (status === 'errored') return 'Session disconnected. Tap Reconnect.'
  return null
}

function messageRowStyle(role: ChatRole): React.CSSProperties {
  return {
    display: 'flex',
    justifyContent: role === 'user' ? 'flex-end' : 'flex-start'
  }
}

function messageBubbleStyle(role: ChatRole): React.CSSProperties {
  if (role === 'user') {
    return {
      maxWidth: '85%',
      padding: '8px 12px',
      borderRadius: 12,
      background: '#e8e8e8',
      color: '#111111',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word'
    }
  }

  if (role === 'assistant') {
    return {
      maxWidth: '85%',
      padding: '8px 12px',
      borderRadius: 12,
      background: '#2a2a2a',
      color: '#e8e8e8',
      overflowX: 'auto'
    }
  }

  return {
    maxWidth: '100%',
    padding: '4px 8px',
    borderRadius: 8,
    background: 'transparent',
    color: '#9ca3af'
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
  padding: '10px 16px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6
}

const assistantTextStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.6875rem',
  lineHeight: 1.5,
  color: '#e8e8e8',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  margin: 0
}

function messageTextStyle(role: ChatRole): React.CSSProperties {
  if (role === 'user') {
    return {
      fontSize: '0.875rem',
      lineHeight: 1.45,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word'
    }
  }

  return {
    fontSize: '0.75rem',
    lineHeight: 1.45
  }
}

const typingBubbleStyle: React.CSSProperties = {
  maxWidth: '85%',
  padding: '8px 12px',
  borderRadius: 12,
  background: '#2a2a2a'
}

const typingTextStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#a0a0a0',
  fontStyle: 'italic'
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

function statusBannerStyle(status: string): React.CSSProperties {
  const isError = status === 'errored'
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 16px',
    borderBottom: '1px solid #333',
    fontSize: '0.75rem',
    color: isError ? '#fecaca' : '#d1d5db',
    background: isError ? 'rgba(127, 29, 29, 0.35)' : '#202020'
  }
}

const statusBannerBtnStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid #444',
  background: '#2a2a2a',
  color: '#f3f4f6',
  fontSize: '0.75rem',
  fontWeight: 600,
  cursor: 'pointer'
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

function createLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getPayloadAgentId(payload: Record<string, unknown>): string | null {
  const candidates = [
    payload.agentId,
    payload.agentID,
    payload.agent_id
  ]

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }

  return null
}

function getOutputChunk(payload: Record<string, unknown>): string {
  if (Array.isArray(payload.lines)) {
    return payload.lines.map((line) => String(line)).join('')
  }

  if (typeof payload.data === 'string') {
    return payload.data
  }

  return ''
}

function isTerminalStatus(status: string): boolean {
  return status === 'idle' || status === 'errored'
}
