import { useState } from 'react'
import styles from './ToolCallCard.module.css'

interface ToolCallCardProps {
  toolCall: {
    tool: string
    input: string
    output?: string
  }
  content: string
}

const TOOL_ICONS: Record<string, string> = {
  Read: '📄',
  Write: '✏️',
  Edit: '🔧',
  Bash: '⚡',
  Glob: '🔍',
  Grep: '🔎',
  WebFetch: '🌐',
  Tool: '🔨'
}

export function ToolCallCard({ toolCall, content }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)
  const icon = TOOL_ICONS[toolCall.tool] || TOOL_ICONS.Tool

  // Determine if this is a success or failure
  const isSuccess = content.includes('✓')
  const isError = content.includes('✗') || content.includes('error')

  return (
    <div
      className={`${styles.card} ${isSuccess ? styles.success : ''} ${isError ? styles.error : ''}`}
    >
      <button className={styles.header} onClick={() => setExpanded(!expanded)}>
        <span className={styles.icon}>{icon}</span>
        <span className={styles.content}>{content}</span>
        <span className={`${styles.chevron} ${expanded ? styles.expanded : ''}`}>
          ›
        </span>
      </button>

      {expanded && toolCall.output && (
        <div className={styles.body}>
          <pre className={styles.output}>{toolCall.output}</pre>
        </div>
      )}
    </div>
  )
}
