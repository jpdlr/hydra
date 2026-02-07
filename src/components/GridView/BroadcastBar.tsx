import { useState } from 'react'
import styles from './BroadcastBar.module.css'

interface BroadcastBarProps {
  onBroadcast: (input: string) => void
  onNewAgent: () => void
  agentCount: number
}

export function BroadcastBar({ onBroadcast, onNewAgent, agentCount }: BroadcastBarProps) {
  const [value, setValue] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    onBroadcast(trimmed)
    setValue('')
  }

  return (
    <div className={styles.bar}>
      <button className={styles.addBtn} onClick={onNewAgent} title="New Agent">
        +
      </button>
      <form className={styles.form} onSubmit={handleSubmit}>
        <span className={styles.label}>Broadcast:</span>
        <input
          className={styles.input}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Send to all ${agentCount} agents...`}
          disabled={agentCount === 0}
        />
        <button
          className={styles.sendBtn}
          type="submit"
          disabled={!value.trim() || agentCount === 0}
        >
          ↵
        </button>
      </form>
    </div>
  )
}
