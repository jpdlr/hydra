import { useState, useEffect, useCallback } from 'react'
import type { ProviderId, SkillInfo, SkillScanResult } from '@shared/types'
import { PROVIDER_LABELS } from '@shared/types'
import styles from './SkillsTab.module.css'

const PROVIDERS: ProviderId[] = ['claude', 'codex']

function groupSkills(skills: SkillInfo[]): Map<string, SkillInfo[]> {
  const groups = new Map<string, SkillInfo[]>()
  for (const skill of skills) {
    const list = groups.get(skill.group) || []
    list.push(skill)
    groups.set(skill.group, list)
  }
  return groups
}

function formatGroupLabel(group: string): string {
  return group
    .replace(/@/g, ' / ')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Skill icon mapping ──────────────────────────────────────────────────
// Maps skill ids/names to recognizable SVG icons

const ICON_MAP: Record<string, { icon: string; bg: string }> = {
  // Development
  commit: { icon: 'git-commit', bg: '#e06c4e' },
  'pull-request-draft': { icon: 'git-pr', bg: '#8b5cf6' },
  'requesting-code-review': { icon: 'git-pr', bg: '#8b5cf6' },
  'receiving-code-review': { icon: 'clipboard-check', bg: '#6366f1' },

  // Planning & process
  'writing-plans': { icon: 'list', bg: '#3b82f6' },
  'executing-plans': { icon: 'play', bg: '#10b981' },
  brainstorming: { icon: 'lightbulb', bg: '#f59e0b' },
  'writing-skills': { icon: 'wand', bg: '#ec4899' },
  'skill-creator': { icon: 'wand', bg: '#ec4899' },

  // Architecture
  'frontend-design': { icon: 'palette', bg: '#e06c4e' },
  'design-postgres-tables': { icon: 'database', bg: '#0ea5e9' },
  'excalidraw-diagram': { icon: 'pen-tool', bg: '#f97316' },

  // Debugging & testing
  'systematic-debugging': { icon: 'bug', bg: '#ef4444' },
  'test-driven-development': { icon: 'flask', bg: '#22c55e' },
  'verification-before-completion': { icon: 'shield-check', bg: '#14b8a6' },

  // Documentation
  'doc-update': { icon: 'file-text', bg: '#6366f1' },

  // Git & branching
  'finishing-a-development-branch': { icon: 'git-branch', bg: '#a855f7' },
  'using-git-worktrees': { icon: 'git-branch', bg: '#a855f7' },

  // Agents & parallelism
  'dispatching-parallel-agents': { icon: 'layers', bg: '#0891b2' },
  'subagent-driven-development': { icon: 'layers', bg: '#0891b2' },
  'using-superpowers': { icon: 'zap', bg: '#eab308' },

  // Codex-specific
  codex: { icon: 'terminal', bg: '#22c55e' },
  'cadi-blazor-crud': { icon: 'code', bg: '#3b82f6' },
}

const DEFAULT_ICON = { icon: 'puzzle', bg: '#6b7280' }

function getSkillIcon(skill: SkillInfo): { icon: string; bg: string } {
  return ICON_MAP[skill.id] || DEFAULT_ICON
}

function SkillIcon({ type, bg }: { type: string; bg: string }) {
  const size = 16
  const svgProps = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'white',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  let path: React.ReactNode
  switch (type) {
    case 'git-commit':
      path = (
        <>
          <circle cx="12" cy="12" r="4" />
          <line x1="1.05" y1="12" x2="7" y2="12" />
          <line x1="17.01" y1="12" x2="22.96" y2="12" />
        </>
      )
      break
    case 'git-pr':
      path = (
        <>
          <circle cx="18" cy="18" r="3" />
          <circle cx="6" cy="6" r="3" />
          <path d="M13 6h3a2 2 0 0 1 2 2v7" />
          <line x1="6" y1="9" x2="6" y2="21" />
        </>
      )
      break
    case 'git-branch':
      path = (
        <>
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </>
      )
      break
    case 'list':
      path = (
        <>
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </>
      )
      break
    case 'play':
      path = <polygon points="5 3 19 12 5 21 5 3" />
      break
    case 'lightbulb':
      path = (
        <>
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
        </>
      )
      break
    case 'wand':
      path = (
        <>
          <path d="M15 4V2" />
          <path d="M15 16v-2" />
          <path d="M8 9h2" />
          <path d="M20 9h2" />
          <path d="M17.8 11.8L19 13" />
          <path d="M15 9h.01" />
          <path d="M17.8 6.2L19 5" />
          <path d="m3 21 9-9" />
          <path d="M12.2 6.2L11 5" />
        </>
      )
      break
    case 'palette':
      path = (
        <>
          <circle cx="13.5" cy="6.5" r="0.5" fill="white" />
          <circle cx="17.5" cy="10.5" r="0.5" fill="white" />
          <circle cx="8.5" cy="7.5" r="0.5" fill="white" />
          <circle cx="6.5" cy="12" r="0.5" fill="white" />
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.5-.7 1.5-1.5 0-.4-.1-.7-.4-1-.3-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16c3.3 0 6-2.7 6-6 0-5.5-4.5-9-10-9z" />
        </>
      )
      break
    case 'database':
      path = (
        <>
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </>
      )
      break
    case 'pen-tool':
      path = (
        <>
          <path d="M12 19l7-7 3 3-7 7-3-3z" />
          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
          <path d="M2 2l7.586 7.586" />
          <circle cx="11" cy="11" r="2" />
        </>
      )
      break
    case 'bug':
      path = (
        <>
          <rect x="8" y="6" width="8" height="14" rx="4" />
          <path d="M19 10h2" />
          <path d="M3 10h2" />
          <path d="M19 14h2" />
          <path d="M3 14h2" />
          <path d="M9 2l1 2h4l1-2" />
          <path d="M12 6v14" />
        </>
      )
      break
    case 'flask':
      path = (
        <>
          <path d="M9 3h6" />
          <path d="M10 9V3h4v6l5 8a2 2 0 0 1-1.7 3H6.7A2 2 0 0 1 5 17z" />
        </>
      )
      break
    case 'shield-check':
      path = (
        <>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <polyline points="9 12 11 14 15 10" />
        </>
      )
      break
    case 'file-text':
      path = (
        <>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </>
      )
      break
    case 'layers':
      path = (
        <>
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </>
      )
      break
    case 'zap':
      path = <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      break
    case 'terminal':
      path = (
        <>
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </>
      )
      break
    case 'code':
      path = (
        <>
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </>
      )
      break
    case 'clipboard-check':
      path = (
        <>
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          <polyline points="9 14 11 16 15 12" />
        </>
      )
      break
    default: // puzzle
      path = (
        <>
          <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 2c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02z" />
        </>
      )
      break
  }

  return (
    <div className={styles.skillIcon} style={{ background: bg }}>
      <svg {...svgProps}>{path}</svg>
    </div>
  )
}

// ── Component ───────────────────────────────────────────────────────────

export function SkillsTab() {
  const [provider, setProvider] = useState<ProviderId>('claude')
  const [result, setResult] = useState<SkillScanResult | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.hydra.scanSkills()
      setResult(data)
    } catch {
      // Failed to scan
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleToggle = async (skill: SkillInfo) => {
    const newEnabled = !skill.enabled
    setResult((prev) => {
      if (!prev) return prev
      const key = skill.provider === 'claude' ? 'claude' : 'codex'
      return {
        ...prev,
        [key]: prev[key].map((s) => {
          if (skill.provider === 'claude' && skill.group !== 'user') {
            return s.group === skill.group ? { ...s, enabled: newEnabled } : s
          }
          return s.id === skill.id && s.group === skill.group ? { ...s, enabled: newEnabled } : s
        })
      }
    })

    const toggleId = skill.provider === 'claude' && skill.group !== 'user' ? skill.group : skill.id
    const { success } = await window.hydra.toggleSkill({
      provider: skill.provider,
      id: toggleId,
      enabled: newEnabled
    })

    if (!success) refresh()
  }

  const handleGroupToggle = async (group: string, groupSkillsList: SkillInfo[]) => {
    const allEnabled = groupSkillsList.every((s) => s.enabled)
    const newEnabled = !allEnabled

    setResult((prev) => {
      if (!prev) return prev
      const key = provider === 'claude' ? 'claude' : 'codex'
      return {
        ...prev,
        [key]: prev[key].map((s) => (s.group === group ? { ...s, enabled: newEnabled } : s))
      }
    })

    if (provider === 'claude' && group !== 'user') {
      const { success } = await window.hydra.toggleSkill({
        provider: 'claude',
        id: group,
        enabled: newEnabled
      })
      if (!success) refresh()
      return
    }

    const results = await Promise.all(
      groupSkillsList
        .filter((s) => s.enabled !== newEnabled)
        .map((s) =>
          window.hydra.toggleSkill({ provider: s.provider, id: s.id, enabled: newEnabled })
        )
    )
    if (results.some((r) => !r.success)) refresh()
  }

  const skills = result ? (provider === 'claude' ? result.claude : result.codex) : []
  const grouped = groupSkills(skills)

  return (
    <div className={styles.container}>
      <div className={styles.providerBar}>
        {PROVIDERS.map((p) => (
          <button
            key={p}
            className={`${styles.providerBtn} ${provider === p ? styles.providerBtnActive : ''}`}
            onClick={() => setProvider(p)}
          >
            {PROVIDER_LABELS[p]}
          </button>
        ))}
      </div>

      <div className={styles.toolbar}>
        <span className={styles.count}>
          {skills.length} skill{skills.length !== 1 ? 's' : ''}
        </span>
        <button className={styles.refreshBtn} onClick={refresh} disabled={loading}>
          Refresh
        </button>
      </div>

      {loading && <div className={styles.loading}>Scanning skills...</div>}

      {!loading && skills.length === 0 && (
        <div className={styles.empty}>No skills found for {PROVIDER_LABELS[provider]}</div>
      )}

      {!loading &&
        Array.from(grouped.entries()).map(([group, groupSkillsList]) => {
          const allEnabled = groupSkillsList.every((s) => s.enabled)
          const someEnabled = groupSkillsList.some((s) => s.enabled)

          return (
            <div key={group} className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionLabel}>{formatGroupLabel(group)}</span>
                <button
                  className={`${styles.groupToggleBtn} ${allEnabled ? styles.groupToggleBtnActive : someEnabled ? styles.groupToggleBtnPartial : ''}`}
                  onClick={() => handleGroupToggle(group, groupSkillsList)}
                  title={allEnabled ? 'Disable all' : 'Enable all'}
                >
                  {allEnabled ? 'Enabled' : someEnabled ? 'Partial' : 'Disabled'}
                </button>
              </div>

              <div className={styles.cardGrid}>
                {groupSkillsList.map((skill) => {
                  const { icon, bg } = getSkillIcon(skill)
                  return (
                    <div
                      key={`${skill.group}-${skill.id}`}
                      className={`${styles.card} ${!skill.enabled ? styles.cardDisabled : ''}`}
                    >
                      <SkillIcon type={icon} bg={bg} />
                      <div className={styles.cardMeta}>
                        <div className={styles.cardName}>{skill.name}</div>
                        {skill.description && (
                          <div className={styles.cardDesc} title={skill.description}>
                            {skill.description}
                          </div>
                        )}
                      </div>
                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          className={styles.toggleInput}
                          checked={skill.enabled}
                          onChange={() => handleToggle(skill)}
                        />
                        <span className={styles.toggleTrack} />
                      </label>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
    </div>
  )
}
