import styles from './ThinkingIndicator.module.css'

export function ThinkingIndicator() {
  return (
    <div className={styles.wrapper}>
      <div className={styles.dots}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
      <span className={styles.label}>Thinking...</span>
    </div>
  )
}
