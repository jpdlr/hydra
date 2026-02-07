import { CodeBlock } from './CodeBlock'
import { ToolCallCard } from './ToolCallCard'
import type { ChatMessage } from '@shared/types'
import styles from './MessageBubble.module.css'

interface MessageBubbleProps {
  message: ChatMessage
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  // Tool call card
  if (message.toolCall) {
    return <ToolCallCard toolCall={message.toolCall} content={message.content} />
  }

  // Code block
  if (message.codeBlocks && message.codeBlocks.length > 0) {
    return (
      <div className={styles.assistant}>
        {message.codeBlocks.map((block, i) => (
          <CodeBlock
            key={i}
            code={block.code}
            language={block.language}
            filePath={block.filePath}
          />
        ))}
      </div>
    )
  }

  // Regular message
  return (
    <div className={`${styles.bubble} ${isUser ? styles.user : styles.assistant}`}>
      {!isUser && <div className={styles.roleLabel}>Claude</div>}
      <div className={styles.content}>{message.content}</div>
    </div>
  )
}
