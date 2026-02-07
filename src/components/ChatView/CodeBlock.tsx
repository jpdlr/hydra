import { useState } from 'react'
import styles from './CodeBlock.module.css'

interface CodeBlockProps {
  code: string
  language: string
  filePath?: string
}

export function CodeBlock({ code, language, filePath }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.lang}>{filePath || language || 'code'}</span>
        <button className={styles.copyBtn} onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className={styles.code}>
        <code>{code}</code>
      </pre>
    </div>
  )
}
