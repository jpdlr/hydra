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

interface ChatBubble {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: string
}

interface LocalUserMessage {
  id: string
  text: string
  timestamp: string
}

interface PersistedChatState {
  localUserMessages: LocalUserMessage[]
  awaitingReplySince: string | null
  promptAnchorTimestamp: string | null
  activePromptText: string | null
}

const OUTPUT_HISTORY_LIMIT = 220
const LOCAL_USER_MAX = 24
const USER_CONTEXT_MAX = 6
const MAX_ASSISTANT_LINES = 40
const MAX_ASSISTANT_CHARS = 4000
const CHAT_STORAGE_VERSION = 'v2'

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
  const [promptAnchorTimestamp, setPromptAnchorTimestamp] = useState<string | null>(null)
  const [activePromptText, setActivePromptText] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const storageKey = `hydra-remote:${CHAT_STORAGE_VERSION}:chat:${agentId}`

  useEffect(() => {
    const state = loadPersistedChatState(storageKey)
    setLocalUserMessages(state.localUserMessages)
    setAwaitingReplySince(state.awaitingReplySince)
    setPromptAnchorTimestamp(state.promptAnchorTimestamp)
    setActivePromptText(state.activePromptText)
  }, [storageKey])

  useEffect(() => {
    savePersistedChatState(storageKey, {
      localUserMessages,
      awaitingReplySince,
      promptAnchorTimestamp,
      activePromptText
    })
  }, [storageKey, localUserMessages, awaitingReplySince, promptAnchorTimestamp, activePromptText])

  const agentMessages = useMemo(() => {
    return messages.filter((msg) => {
      const payloadAgentId = getPayloadAgentId(msg.payload)
      return (
        (msg.type === 'output' && payloadAgentId === agentId) ||
        (msg.type === 'status' && payloadAgentId === agentId)
      )
    })
  }, [messages, agentId])

  const outputMessages = useMemo(() => {
    return agentMessages
      .filter((msg) => msg.type === 'output')
      .sort(compareByTimestampThenId)
      .slice(-OUTPUT_HISTORY_LIMIT)
  }, [agentMessages])

  const relevantOutputMessages = useMemo(() => {
    if (!promptAnchorTimestamp) return []
    return outputMessages.filter((msg) => compareTimestamp(msg.timestamp, promptAnchorTimestamp) > 0)
  }, [outputMessages, promptAnchorTimestamp])

  const assistantText = useMemo(() => {
    if (relevantOutputMessages.length === 0) return null

    const allLines: string[] = []
    const promptText = activePromptText?.trim() || null

    for (const msg of relevantOutputMessages) {
      const rawChunk = getOutputChunk(msg.payload)
      if (!rawChunk) continue
      const cleaned = stripTerminalControl(rawChunk)
      if (!cleaned) continue

      for (const line of cleaned.split('\n')) {
        const normalized = normalizeCandidateLine(line)
        if (!normalized) continue
        allLines.push(normalized)
      }
    }

    if (allLines.length === 0) return null

    // Find the LAST assistant start marker (⏺) — this is the response to the
    // current prompt.  Using the first marker would pick up stale responses from
    // a previous exchange that can still be in the output buffer.
    let startIndex = -1
    for (let i = allLines.length - 1; i >= 0; i--) {
      if (isAssistantStartLine(allLines[i])) {
        startIndex = i
        break
      }
    }
    // Strict mode: do not show any assistant bubble until an explicit assistant marker exists.
    if (startIndex < 0) return null

    const candidateLines: string[] = []

    for (let i = startIndex; i < allLines.length; i += 1) {
      const line = allLines[i]
      const uiTrimmed = stripUiFramePrefix(line)

      if (i > startIndex && (isAssistantStartLine(line) || isPromptEchoLine(line))) {
        break
      }

      if (i > startIndex && isHardNoiseLine(line)) {
        if (isHardStopLine(line)) break
        continue
      }

      let candidate: string | null = null
      if (i === startIndex) {
        candidate = stripAssistantPrefix(line)
      } else if (isAssistantContinuationLine(line)) {
        candidate = cleanAssistantContinuationLine(line)
      }

      if (!candidate) continue
      if (promptText && isPromptTextMatch(uiTrimmed, promptText)) break
      if (promptText && isPromptTextMatch(candidate, promptText)) break
      candidateLines.push(candidate)
    }

    if (candidateLines.length === 0) {
      return null
    }

    const nonPromptLines = candidateLines.filter((line) => {
      if (!promptText) return true
      return !isPromptTextMatch(line, promptText)
    })

    if (nonPromptLines.length === 0) {
      return null
    }

    const uniqueLines = dedupeConsecutiveLines(nonPromptLines)
    if (uniqueLines.length === 0) return null

    if (uniqueLines.length === 1 && uniqueLines[0].length < 2) {
      return null
    }

    const joined = uniqueLines.join('\n').trim()
    if (!joined) return null
    if (promptText && isPromptTextMatch(joined, promptText)) {
      return null
    }

    let text = uniqueLines.slice(0, MAX_ASSISTANT_LINES).join('\n').trim()
    if (!text) return null
    if (text.length > MAX_ASSISTANT_CHARS) {
      text = text.slice(0, MAX_ASSISTANT_CHARS).trimEnd()
    }

    return text || null
  }, [relevantOutputMessages, activePromptText])

  const latestTerminalStatusAt = useMemo(() => {
    let latest: string | null = null
    for (const msg of agentMessages) {
      if (msg.type !== 'status') continue
      const status = String(msg.payload.status ?? '')
      if (!isTerminalStatus(status)) continue
      if (!latest || compareTimestamp(msg.timestamp, latest) > 0) {
        latest = msg.timestamp
      }
    }
    return latest
  }, [agentMessages])

  useEffect(() => {
    if (!awaitingReplySince) return

    if (assistantText) {
      setAwaitingReplySince(null)
      setActivePromptText(null)
      return
    }

    if (latestTerminalStatusAt && isAtOrAfter(latestTerminalStatusAt, awaitingReplySince)) {
      setAwaitingReplySince(null)
      return
    }

    if (isTerminalStatus(agentStatus)) {
      setAwaitingReplySince(null)
    }
  }, [awaitingReplySince, assistantText, latestTerminalStatusAt, agentStatus])

  const chatBubbles = useMemo(() => {
    const userBubbles: ChatBubble[] = localUserMessages.slice(-USER_CONTEXT_MAX).map((message) => ({
      id: message.id,
      role: 'user',
      text: message.text,
      timestamp: message.timestamp
    }))

    if (!assistantText) return userBubbles

    const assistantTimestamp =
      relevantOutputMessages[relevantOutputMessages.length - 1]?.timestamp ??
      new Date().toISOString()
    const assistantBubble: ChatBubble = {
      id: 'assistant-latest',
      role: 'assistant',
      text: assistantText,
      timestamp: assistantTimestamp
    }

    return [...userBubbles, assistantBubble].sort(compareByTimestampThenId)
  }, [localUserMessages, assistantText, relevantOutputMessages])

  const isTyping = Boolean(
    awaitingReplySince &&
    promptAnchorTimestamp &&
    !assistantText &&
    !isTerminalStatus(agentStatus)
  )

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [chatBubbles, isTyping])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return

    const timestamp = new Date().toISOString()
    setLocalUserMessages((prev) => {
      const next = [...prev, { id: `local-${createLocalId()}`, text: trimmed, timestamp }]
      return next.slice(-LOCAL_USER_MAX)
    })
    setPromptAnchorTimestamp(getLatestTimestamp(agentMessages))
    setActivePromptText(trimmed)
    setAwaitingReplySince(timestamp)
    setInput('')

    void Promise.resolve(onSendPrompt(trimmed)).catch(() => {
      setAwaitingReplySince(null)
    })
  }

  const statusText = getStatusBannerText(agentStatus)
  const showStatusBanner = statusText !== null
  const canRestart = agentStatus === 'idle' || agentStatus === 'errored'

  return (
    <div style={containerStyle}>
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

      <div ref={scrollRef} style={messagesStyle}>
        {chatBubbles.map((message) => (
          <div key={message.id} style={messageRowStyle(message.role)}>
            <div style={messageBubbleStyle(message.role)}>
              <span style={messageTextStyle(message.role)}>{message.text}</span>
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
          <div style={emptyMsgStyle}>No messages yet. Send a prompt to get started.</div>
        )}
      </div>

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

function loadPersistedChatState(storageKey: string): PersistedChatState {
  if (typeof window === 'undefined') {
    return {
      localUserMessages: [],
      awaitingReplySince: null,
      promptAnchorTimestamp: null,
      activePromptText: null
    }
  }
  try {
    const raw = window.sessionStorage.getItem(storageKey)
    if (!raw) {
      return {
        localUserMessages: [],
        awaitingReplySince: null,
        promptAnchorTimestamp: null,
        activePromptText: null
      }
    }
    const parsed = JSON.parse(raw) as Partial<PersistedChatState>
    const localUserMessages = Array.isArray(parsed.localUserMessages)
      ? parsed.localUserMessages
          .filter((item): item is LocalUserMessage =>
            Boolean(item) &&
            typeof item.id === 'string' &&
            typeof item.text === 'string' &&
            typeof item.timestamp === 'string'
          )
          .slice(-LOCAL_USER_MAX)
      : []
    const awaitingReplySince = typeof parsed.awaitingReplySince === 'string'
      ? parsed.awaitingReplySince
      : null
    const promptAnchorTimestamp = typeof parsed.promptAnchorTimestamp === 'string'
      ? parsed.promptAnchorTimestamp
      : null
    const activePromptText = typeof parsed.activePromptText === 'string'
      ? parsed.activePromptText
      : null
    return { localUserMessages, awaitingReplySince, promptAnchorTimestamp, activePromptText }
  } catch {
    return {
      localUserMessages: [],
      awaitingReplySince: null,
      promptAnchorTimestamp: null,
      activePromptText: null
    }
  }
}

function savePersistedChatState(storageKey: string, state: PersistedChatState): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(state))
  } catch {
    // Ignore storage quota/private mode failures.
  }
}

function getPayloadAgentId(payload: Record<string, unknown>): string | null {
  const candidates = [payload.agentId, payload.agentID, payload.agent_id]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function getOutputChunk(payload: Record<string, unknown>): string {
  if (Array.isArray(payload.lines)) return payload.lines.map((line) => String(line)).join('')
  if (typeof payload.data === 'string') return payload.data
  return ''
}

function stripTerminalControl(raw: string): string {
  return raw
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u009B[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001B[@-_]/g, '')
    .replace(/\u0008/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, (char) => (char === '\n' || char === '\t' ? char : ''))
    .replace(/\r/g, '\n')
    .replace(/\uFFFD/g, '')
}

function normalizeCandidateLine(line: string): string | null {
  const normalized = line.replace(/\s+/g, ' ').trim()
  return normalized || null
}

function isPromptEchoLine(line: string): boolean {
  return /^([›>❯])\s*/.test(stripUiFramePrefix(line))
}

function isAssistantStartLine(line: string): boolean {
  return /^[⏺●•]/.test(stripUiFramePrefix(line))
}

function stripAssistantPrefix(line: string): string {
  const stripped = stripUiFramePrefix(line).replace(/^[⏺●•]\s*/, '')
  return truncateScreenLineJunk(stripped).trim()
}

/** Truncate junk from terminal screen lines where cursor positioning causes
 *  response text and status bar content to merge onto the same line. */
function truncateScreenLineJunk(text: string): string {
  // Cut at first middle-dot or tool-use bracket preceded by a space
  const junkBoundary = text.search(/\s[·✢✳✶✻✽✴⎿⏵⏺●•]/)
  if (junkBoundary > 0) {
    text = text.slice(0, junkBoundary)
  }
  // Cut at (thinking) / (running stop hook …)
  text = text.replace(/\s*\((?:thinking|running\s).*$/i, '')
  return text
}

function isHardNoiseLine(line: string): boolean {
  const stripped = stripUiFramePrefix(line)
  const lower = line.toLowerCase()
  if (stripped.startsWith('✳') || stripped.startsWith('⏵⏵')) return true
  if (lower.includes('next:')) return true
  if (/^https?:\/\/claude\.ai\/code\/session_/.test(lower)) return true
  if (lower.includes('opus 4.6')) return true
  if (lower.includes('session / $')) return true
  if (lower.includes(' today / $')) return true
  if (lower.includes(' block (')) return true
  if (lower.includes('ccusage')) return true
  if (lower.includes('shift+tab')) return true
  if (lower.includes('bypass permissions')) return true
  if (lower.includes('remote-control is active')) return true
  if (lower.includes('running stop hook')) return true
  if (lower === 'thinking') return true
  if (isMostlyUiFrame(line)) return true
  if (/^[\u2500-\u257F\s]+$/.test(line)) return true
  if (/^[<>=|`~_.\-:;,+* ]+$/.test(line)) return true
  if (/^\d{1,3}%/.test(line)) return true
  if (/^\$?\d+(\.\d+)?\/hr\b/.test(lower)) return true
  if (/^\d+m left\b/.test(lower)) return true
  return false
}

function isHardStopLine(line: string): boolean {
  const stripped = stripUiFramePrefix(line)
  const lower = line.toLowerCase()
  return (
    stripped.startsWith('⏵⏵') ||
    stripped.startsWith('✳') ||
    lower.includes('next:') ||
    lower.includes('opus 4.6') ||
    lower.includes('session / $') ||
    lower.includes('bypass permissions') ||
    lower.includes('ccusage') ||
    lower.includes('shift+tab') ||
    /^([›>❯])\s*/.test(stripped) ||
    /^[\u2500-\u257F\s]+$/.test(line)
  )
}

function isAssistantContinuationLine(line: string): boolean {
  if (isHardNoiseLine(line) || isPromptEchoLine(line)) return false
  if (line.startsWith('$')) return false
  return hasAtLeastOneWord(line, 1)
}

function cleanAssistantContinuationLine(line: string): string | null {
  const cleaned = truncateScreenLineJunk(stripUiFramePrefix(stripUiFrameSuffix(line))).trim()
  return cleaned || null
}

function isPromptTextMatch(line: string, promptText: string): boolean {
  const normalizedLine = normalizeTextForComparison(line)
  const normalizedPrompt = normalizeTextForComparison(promptText)
  if (!normalizedLine || !normalizedPrompt) return false
  return normalizedLine === normalizedPrompt || normalizedLine.startsWith(`${normalizedPrompt} `)
}

function normalizeTextForComparison(value: string): string {
  return value
    .toLowerCase()
    .replace(/^[›>❯\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasAtLeastOneWord(line: string, minLength: number): boolean {
  const regex = new RegExp(`[A-Za-z]{${minLength},}`)
  return regex.test(line)
}

function isMostlyUiFrame(line: string): boolean {
  const stripped = line.replace(/\s+/g, '')
  if (!stripped) return false
  const uiChars = (stripped.match(/[─━│┌┐└┘┬┴┼╭╮╰╯❯]/g) || []).length
  return uiChars / stripped.length >= 0.55
}

function dedupeConsecutiveLines(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) {
    if (out[out.length - 1] === line) continue
    out.push(line)
  }
  return out
}

function stripUiFramePrefix(line: string): string {
  return line.replace(/^[\s│┃┆┊╎╏|─━┌┐└┘┬┴┼╭╮╰╯]+/, '').trimStart()
}

function stripUiFrameSuffix(line: string): string {
  return line.replace(/[\s│┃┆┊╎╏|─━┌┐└┘┬┴┼╭╮╰╯]+$/, '').trimEnd()
}

function isTerminalStatus(status: string): boolean {
  return status === 'idle' || status === 'errored'
}

function parseIsoMs(timestamp: string): number | null {
  const parsed = Date.parse(timestamp)
  return Number.isNaN(parsed) ? null : parsed
}

function compareTimestamp(a: string, b: string): number {
  const aMs = parseIsoMs(a)
  const bMs = parseIsoMs(b)
  if (aMs !== null && bMs !== null && aMs !== bMs) return aMs - bMs
  return a.localeCompare(b)
}

function compareByTimestampThenId(a: { timestamp: string; id: string }, b: { timestamp: string; id: string }): number {
  const timeCompare = compareTimestamp(a.timestamp, b.timestamp)
  if (timeCompare !== 0) return timeCompare
  return a.id.localeCompare(b.id)
}

function isAtOrAfter(timestamp: string, reference: string): boolean {
  return compareTimestamp(timestamp, reference) >= 0
}

function getLatestTimestamp(messages: OutboxMessage[]): string {
  let latest = ''
  for (const msg of messages) {
    if (!latest || compareTimestamp(msg.timestamp, latest) > 0) {
      latest = msg.timestamp
    }
  }
  return latest || new Date().toISOString()
}

function createLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
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

function messageRowStyle(role: 'user' | 'assistant'): React.CSSProperties {
  return {
    display: 'flex',
    justifyContent: role === 'user' ? 'flex-end' : 'flex-start'
  }
}

function messageBubbleStyle(role: 'user' | 'assistant'): React.CSSProperties {
  if (role === 'user') {
    return {
      maxWidth: '80%',
      padding: '10px 12px',
      borderRadius: 14,
      background: '#e8e8e8',
      color: '#111111'
    }
  }

  return {
    maxWidth: '90%',
    padding: '10px 12px',
    borderRadius: 14,
    background: '#2a2a2a',
    color: '#e8e8e8'
  }
}

function messageTextStyle(role: 'user' | 'assistant'): React.CSSProperties {
  if (role === 'user') {
    return {
      fontSize: '0.9375rem',
      lineHeight: 1.4,
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere'
    }
  }

  return {
    fontSize: '0.875rem',
    lineHeight: 1.45,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere'
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
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8
}

const typingBubbleStyle: React.CSSProperties = {
  maxWidth: '74%',
  padding: '9px 12px',
  borderRadius: 14,
  background: '#2a2a2a'
}

const typingTextStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
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
