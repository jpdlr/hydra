import { useEffect, useRef } from 'react'
import { MessageBubble } from './MessageBubble'
import { ThinkingIndicator } from './ThinkingIndicator'
import type { ChatMessage } from '@shared/types'
import styles from './MessageList.module.css'

interface MessageListProps {
  messages: ChatMessage[]
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive,
  // but only if already near the bottom (within 120px).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Collapse consecutive thinking messages into one
  const filtered = messages.filter((msg, i) => {
    if (!msg.isThinking) return true
    const next = messages[i + 1]
    // Keep only the last thinking message in a run
    return !next?.isThinking
  })

  if (filtered.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyText}>No messages yet. Send a prompt to get started.</span>
      </div>
    )
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.list}>
        {filtered.map((msg) =>
          msg.isThinking ? (
            <ThinkingIndicator key={msg.id} />
          ) : (
            <MessageBubble key={msg.id} message={msg} />
          )
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
