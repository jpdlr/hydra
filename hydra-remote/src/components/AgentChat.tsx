import { type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import claudeIcon from '../assets/claude-icon.png'
import codexIcon from '../assets/codex-icon.png'
import styles from './AgentChat.module.css'

interface OutboxMessage {
  id: string
  type: 'output' | 'status' | 'notification' | 'agent_list' | 'conversation_history'
  payload: Record<string, unknown>
  timestamp: string
}

interface TranscriptMessage {
  role: 'user' | 'assistant'
  text: string
  timestamp: string
}

interface AgentChatProps {
  agentId: string
  agentName: string
  agentStatus: string
  provider?: string
  remoteSessionId: string | null
  agentSessionId: string | null
  messages: OutboxMessage[]
  onSendPrompt: (input: string) => void | Promise<void>
  onSendCommand: (type: 'get_history', payload: Record<string, unknown>) => void | Promise<void>
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

interface ContentBlockBase {
  key: string
  type: 'paragraph' | 'heading' | 'unordered-list' | 'ordered-list' | 'code'
}

interface ParagraphBlock extends ContentBlockBase {
  type: 'paragraph'
  text: string
}

interface HeadingBlock extends ContentBlockBase {
  type: 'heading'
  text: string
  level: 1 | 2 | 3
}

interface ListBlock extends ContentBlockBase {
  type: 'unordered-list' | 'ordered-list'
  items: string[]
}

interface CodeBlock extends ContentBlockBase {
  type: 'code'
  code: string
  language: string | null
}

type ContentBlock = ParagraphBlock | HeadingBlock | ListBlock | CodeBlock

const OUTPUT_HISTORY_LIMIT = 220
const LOCAL_USER_MAX = 24
const MAX_ASSISTANT_LINES = 40
const MAX_ASSISTANT_CHARS = 4000
const CHAT_STORAGE_VERSION = 'v3'
const HISTORY_REFRESH_INTERVAL_MS = 10_000
const QUICK_ACTIONS = [
  'Summarize the current state of this task.',
  'What should we do next?',
  'List the blockers you see right now.'
]

export function AgentChat({
  agentId,
  agentName,
  agentStatus,
  provider,
  remoteSessionId,
  agentSessionId,
  messages,
  onSendPrompt,
  onSendCommand,
  onRestart,
  onBack
}: AgentChatProps) {
  const [input, setInput] = useState('')
  const [localUserMessages, setLocalUserMessages] = useState<LocalUserMessage[]>([])
  const [awaitingReplySince, setAwaitingReplySince] = useState<string | null>(null)
  const [promptAnchorTimestamp, setPromptAnchorTimestamp] = useState<string | null>(null)
  const [activePromptText, setActivePromptText] = useState<string | null>(null)
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const isNearBottomRef = useRef(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [transcriptHistory, setTranscriptHistory] = useState<TranscriptMessage[]>([])
  const storageKey = `hydra-remote:${CHAT_STORAGE_VERSION}:chat:${remoteSessionId ?? 'no-remote-session'}:${agentId}:${agentSessionId ?? 'no-agent-session'}`

  useEffect(() => {
    const requestHistory = () => {
      void Promise.resolve(onSendCommand('get_history', { agentId }))
    }

    requestHistory()

    const intervalId = window.setInterval(requestHistory, HISTORY_REFRESH_INTERVAL_MS)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestHistory()
      }
    }

    window.addEventListener('focus', requestHistory)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', requestHistory)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [agentId, onSendCommand])

  useEffect(() => {
    const historyMsg = [...messages]
      .reverse()
      .find((msg) => {
        if (msg.type !== 'conversation_history') return false
        if ((msg.payload.agentId as string) !== agentId) return false

        const payloadSessionId = typeof msg.payload.sessionId === 'string'
          ? msg.payload.sessionId
          : null

        if (agentSessionId && payloadSessionId && payloadSessionId !== agentSessionId) {
          return false
        }

        return true
      })
    if (!historyMsg) return

    const incoming = historyMsg.payload.messages
    if (!Array.isArray(incoming)) {
      setTranscriptHistory([])
      return
    }
    if (incoming.length === 0) {
      setTranscriptHistory([])
      return
    }

    setTranscriptHistory(
      incoming
        .filter(
          (m: TranscriptMessage) =>
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.text === 'string' &&
            m.text.trim().length > 0
        )
        .map((m: TranscriptMessage) => ({
          role: m.role,
          text: m.text.trim(),
          timestamp: m.timestamp || ''
        }))
    )
  }, [messages, agentId, agentSessionId])

  useEffect(() => {
    setTranscriptHistory([])
  }, [agentId, agentSessionId, remoteSessionId])

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

  const conversationHistory = useMemo(() => {
    if (transcriptHistory.length === 0) return []

    return transcriptHistory.map((msg, i) => ({
      id: `transcript-${i}`,
      role: msg.role,
      text: msg.text,
      timestamp: msg.timestamp
    }))
  }, [transcriptHistory])

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

    let startIndex = -1
    for (let i = allLines.length - 1; i >= 0; i -= 1) {
      if (isAssistantStartLine(allLines[i])) {
        startIndex = i
        break
      }
    }

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

    if (candidateLines.length === 0) return null

    const nonPromptLines = candidateLines.filter((line) => {
      if (!promptText) return true
      return !isPromptTextMatch(line, promptText)
    })

    if (nonPromptLines.length === 0) return null

    const uniqueLines = dedupeConsecutiveLines(nonPromptLines)
    if (uniqueLines.length === 0) return null

    if (uniqueLines.length === 1 && uniqueLines[0].length < 2) return null

    const joined = uniqueLines.join('\n').trim()
    if (!joined) return null
    if (promptText && isPromptTextMatch(joined, promptText)) return null

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
    const historyUserTexts = new Set(
      conversationHistory
        .filter((b) => b.role === 'user')
        .map((b) => b.text.toLowerCase().trim())
    )

    const pendingUserBubbles: ChatBubble[] = localUserMessages
      .filter((m) => !historyUserTexts.has(m.text.toLowerCase().trim()))
      .map((message) => ({
        id: message.id,
        role: 'user' as const,
        text: message.text,
        timestamp: message.timestamp
      }))

    const liveBubbles: ChatBubble[] = []
    if (assistantText) {
      const lastHistAssistant = [...conversationHistory].reverse().find((b: ChatBubble) => b.role === 'assistant')
      if (!lastHistAssistant || lastHistAssistant.text !== assistantText) {
        const assistantTimestamp =
          relevantOutputMessages[relevantOutputMessages.length - 1]?.timestamp ??
          new Date().toISOString()
        liveBubbles.push({
          id: 'assistant-latest',
          role: 'assistant',
          text: assistantText,
          timestamp: assistantTimestamp
        })
      }
    }

    return [...conversationHistory, ...pendingUserBubbles, ...liveBubbles].sort(compareByTimestampThenId)
  }, [conversationHistory, localUserMessages, assistantText, relevantOutputMessages])

  const isTyping = Boolean(
    awaitingReplySince &&
    promptAnchorTimestamp &&
    !assistantText &&
    !isTerminalStatus(agentStatus)
  )

  const statusText = getStatusBannerText(agentStatus)
  const showStatusBanner = statusText !== null
  const canRestart = agentStatus === 'idle' || agentStatus === 'errored'
  // Scroll to bottom only when user is already near the bottom (or on mount)
  useEffect(() => {
    if (!isNearBottomRef.current) return
    const scroll = () => {
      if (scrollRef.current && isNearBottomRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    }
    const t = setTimeout(scroll, 100)
    return () => clearTimeout(t)
  }, [chatBubbles, isTyping])

  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`
  }, [input])

  // Fix iOS Safari gap when virtual keyboard closes
  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    const handleBlur = () => {
      setTimeout(() => {
        window.scrollTo(0, 0)
      }, 50)
    }
    element.addEventListener('blur', handleBlur)
    return () => element.removeEventListener('blur', handleBlur)
  }, [])

  useEffect(() => {
    if (!copiedCodeKey) return
    const timer = window.setTimeout(() => setCopiedCodeKey(null), 1800)
    return () => window.clearTimeout(timer)
  }, [copiedCodeKey])

  const submitPrompt = (rawInput: string) => {
    const trimmed = rawInput.trim()
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

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    submitPrompt(input)
  }

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submitPrompt(input)
    }
  }

  const handleQuickAction = (prompt: string) => {
    setInput(prompt)
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(prompt.length, prompt.length)
    })
  }

  const handleCopyCode = async (codeKey: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCodeKey(codeKey)
    } catch {
      setCopiedCodeKey(null)
    }
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={onBack} aria-label="Back to agents">
          <span aria-hidden="true">←</span>
        </button>

        <div className={styles.headerMeta}>
          <div className={styles.headerTitleRow}>
            <span className={styles.headerName}>{agentName}</span>
            <span className={styles.statusDot} style={{ '--status-color': getStatusColor(agentStatus) } as CSSProperties} />
          </div>
          <span className={styles.headerSubtitle}>
            {getHeaderSubtitle(agentStatus, chatBubbles.length, isTyping)}
          </span>
        </div>
      </header>

      {showStatusBanner && (
        <div
          className={`${styles.statusBanner} ${agentStatus === 'errored' ? styles.statusBannerError : ''}`}
        >
          <span>{statusText}</span>
          {canRestart && (
            <button type="button" className={styles.statusButton} onClick={onRestart}>
              {agentStatus === 'errored' ? 'Reconnect' : 'Restart'}
            </button>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        className={styles.timeline}
        onScroll={() => {
          const el = scrollRef.current
          if (!el) return
          const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
          isNearBottomRef.current = distFromBottom < 150
          setShowScrollBtn(distFromBottom > 150)
        }}
      >
        {chatBubbles.length === 0 && !isTyping && (
          <section className={styles.emptyState}>
            <div className={styles.emptyStateBadge}>Hydra Remote</div>
            <h2 className={styles.emptyStateTitle}>Interactive chat is ready</h2>
            <p className={styles.emptyStateText}>
              Ask for summaries, next actions, or targeted edits. Messages now render as rich content with code blocks and cleaner transcript structure.
            </p>
            <div className={styles.quickActions}>
              {QUICK_ACTIONS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className={styles.quickAction}
                  onClick={() => handleQuickAction(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </section>
        )}

        {chatBubbles.map((message) => (
          <article
            key={message.id}
            className={`${styles.messageRow} ${message.role === 'user' ? styles.messageRowUser : styles.messageRowAssistant}`}
          >
            <div className={`${styles.avatar} ${message.role === 'user' ? styles.avatarUser : styles.avatarAssistant}`}>
              {message.role === 'user' ? 'You' : (
                <img
                  src={provider === 'codex' ? codexIcon : claudeIcon}
                  alt={provider === 'codex' ? 'Codex' : 'Claude'}
                  className={styles.avatarIcon}
                />
              )}
            </div>

            <div className={`${styles.messageCard} ${message.role === 'user' ? styles.messageCardUser : styles.messageCardAssistant}`}>
              <div className={styles.messageMeta}>
                <span className={styles.messageAuthor}>{message.role === 'user' ? 'You' : agentName}</span>
                <time dateTime={message.timestamp}>{formatTimestamp(message.timestamp)}</time>
              </div>

              <RichMessage
                text={message.text}
                role={message.role}
                copiedCodeKey={copiedCodeKey}
                onCopyCode={handleCopyCode}
              />
            </div>
          </article>
        ))}

        {isTyping && (
          <article className={`${styles.messageRow} ${styles.messageRowAssistant}`}>
            <div className={`${styles.avatar} ${styles.avatarAssistant}`}>
              <img
                src={provider === 'codex' ? codexIcon : claudeIcon}
                alt={provider === 'codex' ? 'Codex' : 'Claude'}
                className={styles.avatarIcon}
              />
            </div>
            <div className={`${styles.messageCard} ${styles.messageCardAssistant}`}>
              <div className={styles.messageMeta}>
                <span className={styles.messageAuthor}>{agentName}</span>
                <span>Responding now</span>
              </div>
              <div className={styles.typingIndicator} aria-label="Agent is typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          </article>
        )}
      </div>

      {showScrollBtn && (
        <button
          type="button"
          className={styles.scrollDownBtn}
          onClick={() => {
            isNearBottomRef.current = true
            if (scrollRef.current) {
              scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
            }
          }}
          aria-label="Scroll to bottom"
        >
          ↓
        </button>
      )}

      <footer className={styles.composerShell}>
        <div className={styles.quickActions}>
          {QUICK_ACTIONS.map((prompt) => (
            <button
              key={`footer-${prompt}`}
              type="button"
              className={styles.quickActionFooter}
              onClick={() => handleQuickAction(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className={styles.composerForm}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder="Ask Hydra Remote for the next move..."
            rows={1}
            autoFocus
          />

          <div className={styles.composerActions}>
            <span className={styles.composerHint}>Enter to send · Shift+Enter for newline</span>
            <button type="submit" className={styles.sendButton} disabled={!input.trim()}>
              Send
            </button>
          </div>
        </form>
      </footer>
    </div>
  )
}

function RichMessage({
  text,
  role,
  copiedCodeKey,
  onCopyCode
}: {
  text: string
  role: 'user' | 'assistant'
  copiedCodeKey: string | null
  onCopyCode: (codeKey: string, code: string) => void | Promise<void>
}) {
  if (role === 'user') {
    return <p className={styles.userText}>{text}</p>
  }

  const blocks = parseContentBlocks(text)

  return (
    <div className={styles.richContent}>
      {blocks.map((block) => {
        switch (block.type) {
          case 'heading':
            if (block.level === 1) return <h1 key={block.key}>{renderInline(block.text, block.key)}</h1>
            if (block.level === 2) return <h2 key={block.key}>{renderInline(block.text, block.key)}</h2>
            return <h3 key={block.key}>{renderInline(block.text, block.key)}</h3>
          case 'unordered-list':
            return (
              <ul key={block.key}>
                {block.items.map((item, index) => (
                  <li key={`${block.key}-${index}`}>{renderInline(item, `${block.key}-${index}`)}</li>
                ))}
              </ul>
            )
          case 'ordered-list':
            return (
              <ol key={block.key}>
                {block.items.map((item, index) => (
                  <li key={`${block.key}-${index}`}>{renderInline(item, `${block.key}-${index}`)}</li>
                ))}
              </ol>
            )
          case 'code': {
            const copyLabel = copiedCodeKey === block.key ? 'Copied' : 'Copy'
            return (
              <section key={block.key} className={styles.codeBlock}>
                <div className={styles.codeHeader}>
                  <span>{block.language ?? 'code'}</span>
                  <button type="button" className={styles.codeCopyButton} onClick={() => void onCopyCode(block.key, block.code)}>
                    {copyLabel}
                  </button>
                </div>
                <pre>
                  <code>{block.code}</code>
                </pre>
              </section>
            )
          }
          case 'paragraph':
            return <p key={block.key}>{renderInline(block.text, block.key)}</p>
        }
      })}
    </div>
  )
}

function parseContentBlocks(text: string): ContentBlock[] {
  const normalized = text.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const blocks: ContentBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    const fenceMatch = trimmed.match(/^```(\S+)?\s*$/)
    if (fenceMatch) {
      const codeLines: string[] = []
      const language = fenceMatch[1] ?? null
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({
        key: `block-${blocks.length}`,
        type: 'code',
        code: codeLines.join('\n').trimEnd(),
        language
      })
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/)
    if (headingMatch) {
      blocks.push({
        key: `block-${blocks.length}`,
        type: 'heading',
        level: Math.min(headingMatch[1].length, 3) as 1 | 2 | 3,
        text: headingMatch[2].trim()
      })
      index += 1
      continue
    }

    const unorderedMatch = trimmed.match(/^[-*+]\s+(.*)$/)
    if (unorderedMatch) {
      const items: string[] = []
      while (index < lines.length) {
        const candidate = lines[index].trim().match(/^[-*+]\s+(.*)$/)
        if (!candidate) break
        items.push(candidate[1].trim())
        index += 1
      }
      blocks.push({
        key: `block-${blocks.length}`,
        type: 'unordered-list',
        items
      })
      continue
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/)
    if (orderedMatch) {
      const items: string[] = []
      while (index < lines.length) {
        const candidate = lines[index].trim().match(/^\d+\.\s+(.*)$/)
        if (!candidate) break
        items.push(candidate[1].trim())
        index += 1
      }
      blocks.push({
        key: `block-${blocks.length}`,
        type: 'ordered-list',
        items
      })
      continue
    }

    const paragraphLines: string[] = [trimmed]
    index += 1
    while (index < lines.length) {
      const candidate = lines[index]
      const candidateTrimmed = candidate.trim()
      if (!candidateTrimmed) break
      if (/^```(\S+)?\s*$/.test(candidateTrimmed)) break
      if (/^(#{1,3})\s+/.test(candidateTrimmed)) break
      if (/^[-*+]\s+/.test(candidateTrimmed)) break
      if (/^\d+\.\s+/.test(candidateTrimmed)) break
      paragraphLines.push(candidateTrimmed)
      index += 1
    }
    blocks.push({
      key: `block-${blocks.length}`,
      type: 'paragraph',
      text: paragraphLines.join(' ')
    })
  }

  return blocks
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|https?:\/\/[^\s)]+(?:\)[^\s]*)?)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  for (match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    const token = match[0]
    const tokenKey = `${keyPrefix}-${match.index}`
    if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(<code key={tokenKey}>{token.slice(1, -1)}</code>)
    } else if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
      nodes.push(<strong key={tokenKey}>{token.slice(2, -2)}</strong>)
    } else if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) {
      nodes.push(<em key={tokenKey}>{token.slice(1, -1)}</em>)
    } else if (token.startsWith('http://') || token.startsWith('https://')) {
      nodes.push(
        <a key={tokenKey} href={token} target="_blank" rel="noreferrer">
          {token}
        </a>
      )
    } else {
      nodes.push(token)
    }

    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
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

function truncateScreenLineJunk(text: string): string {
  const junkBoundary = text.search(/\s[·✢✳✶✻✽✴⎿⏵⏺●•]/)
  if (junkBoundary > 0) {
    text = text.slice(0, junkBoundary)
  }
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

function getStatusBannerText(status: string): string | null {
  if (status === 'starting') return 'Starting session...'
  if (status === 'idle') return 'Session is idle. Send a prompt or restart.'
  if (status === 'errored') return 'Session disconnected. Tap Reconnect.'
  return null
}

function getStatusColor(status: string): string {
  if (status === 'running') return 'var(--color-status-running)'
  if (status === 'errored') return 'var(--color-status-error)'
  if (status === 'starting') return 'var(--color-status-starting)'
  return 'var(--color-status-idle)'
}

function getHeaderSubtitle(status: string, messageCount: number, isTyping: boolean): string {
  if (isTyping) return 'Streaming reply'
  if (status === 'running') return `${messageCount} messages in this conversation`
  if (status === 'starting') return 'Session is spinning up'
  if (status === 'errored') return 'Session disconnected'
  return 'Ready for the next prompt'
}

function formatTimestamp(timestamp: string): string {
  const parsed = parseIsoMs(timestamp)
  if (parsed === null) return 'Now'
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(parsed)
}
