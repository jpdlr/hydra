import { useEffect, useState } from 'react'
import type { GitDiffStats } from '@shared/types'
import styles from './DiffStats.module.css'

interface DiffStatsProps {
  projectDir: string | null | undefined
  /** Bump this value to trigger an immediate refetch (e.g. after a commit). */
  refreshKey?: number | string
  pollMs?: number
}

const SQUARE_COUNT = 5

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

function computeSquares(additions: number, deletions: number): ('add' | 'del' | 'empty')[] {
  const total = additions + deletions
  if (total === 0) return Array(SQUARE_COUNT).fill('empty')

  // GitHub-style: fill squares proportionally, rounding to nearest; at least one of each
  // if that side has any count.
  const rawAdd = (additions / total) * SQUARE_COUNT
  let addSquares = Math.round(rawAdd)
  if (additions > 0 && addSquares === 0) addSquares = 1
  if (deletions > 0 && addSquares === SQUARE_COUNT) addSquares = SQUARE_COUNT - 1

  const delSquares = SQUARE_COUNT - addSquares
  return [
    ...Array(addSquares).fill('add' as const),
    ...Array(delSquares).fill('del' as const),
  ]
}

export function DiffStats({ projectDir, refreshKey, pollMs = 15_000 }: DiffStatsProps) {
  const [stats, setStats] = useState<GitDiffStats | null>(null)

  useEffect(() => {
    if (!projectDir) { setStats(null); return }
    let cancelled = false

    const fetchStats = () => {
      const fn = window.hydra?.getGitDiffStats
      if (typeof fn !== 'function') return
      fn(projectDir).then((s) => {
        if (!cancelled) setStats(s)
      }).catch(() => {
        if (!cancelled) setStats(null)
      })
    }

    fetchStats()
    const interval = setInterval(fetchStats, pollMs)
    return () => { cancelled = true; clearInterval(interval) }
  }, [projectDir, refreshKey, pollMs])

  if (!stats || (stats.additions === 0 && stats.deletions === 0)) return null

  const squares = computeSquares(stats.additions, stats.deletions)
  const title = `${formatNumber(stats.additions)} additions, ${formatNumber(stats.deletions)} deletions across ${stats.files} file${stats.files === 1 ? '' : 's'}`

  return (
    <span className={styles.diffStats} title={title}>
      <span className={styles.additions}>+{formatNumber(stats.additions)}</span>
      <span className={styles.deletions}>-{formatNumber(stats.deletions)}</span>
      <span className={styles.squares} aria-hidden="true">
        {squares.map((kind, i) => (
          <span
            key={i}
            className={
              kind === 'add' ? styles.squareAdd
                : kind === 'del' ? styles.squareDel
                : styles.squareEmpty
            }
          />
        ))}
      </span>
    </span>
  )
}
