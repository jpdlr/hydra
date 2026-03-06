import type { FilterChip } from './useFilterSort'
import styles from './FilterChips.module.css'

interface FilterChipsProps {
  chips: FilterChip[]
  onDismiss: (chipKey: string) => void
}

export function FilterChips({ chips, onDismiss }: FilterChipsProps) {
  if (chips.length === 0) return null
  return (
    <div className={styles.row}>
      {chips.map((chip) => (
        <button
          key={chip.key}
          className={styles.chip}
          onClick={() => onDismiss(chip.key)}
          title={`Remove ${chip.label} filter`}
        >
          {chip.label}
          <span className={styles.chipX}>×</span>
        </button>
      ))}
    </div>
  )
}
