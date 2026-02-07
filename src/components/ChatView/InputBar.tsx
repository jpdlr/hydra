import { useState, useRef, useCallback } from 'react'
import type { ModelId } from '@shared/types'
import styles from './InputBar.module.css'

interface InputBarProps {
  onSend: (input: string) => void
  disabled?: boolean
  model?: ModelId
  placeholder?: string
}

export function InputBar({
  onSend,
  disabled = false,
  model,
  placeholder = 'Send a message...'
}: InputBarProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
  }, [value, disabled, onSend])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  return (
    <div className={styles.bar}>
      <div className={styles.inputWrapper}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
        />
        <div className={styles.actions}>
          {model && <span className={styles.model}>{model}</span>}
          <button
            className={styles.sendBtn}
            onClick={handleSubmit}
            disabled={disabled || !value.trim()}
            title="Send (Enter)"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  )
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  )
}
