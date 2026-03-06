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

function isGroupEnabled(skills: SkillInfo[]): boolean {
  return skills.every((s) => s.enabled)
}

function isGroupPartial(skills: SkillInfo[]): boolean {
  const enabled = skills.filter((s) => s.enabled).length
  return enabled > 0 && enabled < skills.length
}

export function SkillsTab() {
  const [provider, setProvider] = useState<ProviderId>('claude')
  const [result, setResult] = useState<SkillScanResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

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

  // Auto-expand all groups when provider changes or data loads
  useEffect(() => {
    const skills = result ? (provider === 'claude' ? result.claude : result.codex) : []
    const groups = groupSkills(skills)
    setExpanded(new Set(groups.keys()))
  }, [provider, result])

  const toggleExpand = (group: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

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
    const allEnabled = isGroupEnabled(groupSkillsList)
    const newEnabled = !allEnabled

    // Optimistic update
    setResult((prev) => {
      if (!prev) return prev
      const key = provider === 'claude' ? 'claude' : 'codex'
      return {
        ...prev,
        [key]: prev[key].map((s) => (s.group === group ? { ...s, enabled: newEnabled } : s))
      }
    })

    // For Claude plugins, one toggle call covers all skills in the group
    if (provider === 'claude' && group !== 'user') {
      const { success } = await window.hydra.toggleSkill({
        provider: 'claude',
        id: group,
        enabled: newEnabled
      })
      if (!success) refresh()
      return
    }

    // For Codex or user skills, toggle each skill individually
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

      {!loading && (
        <div className={styles.groupList}>
          {Array.from(grouped.entries()).map(([group, groupSkillsList]) => {
            const isOpen = expanded.has(group)
            const allEnabled = isGroupEnabled(groupSkillsList)
            const partial = isGroupPartial(groupSkillsList)

            return (
              <div key={group} className={styles.group}>
                <div className={styles.groupHeader}>
                  <button
                    className={styles.groupToggleBtn}
                    onClick={() => toggleExpand(group)}
                    aria-expanded={isOpen}
                  >
                    <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}>
                      {'\u25B8'}
                    </span>
                    <span className={styles.groupLabel}>{formatGroupLabel(group)}</span>
                    <span className={styles.groupCount}>{groupSkillsList.length}</span>
                  </button>
                  <label
                    className={styles.toggle}
                    onClick={(e) => e.stopPropagation()}
                    title={allEnabled ? 'Disable all in group' : 'Enable all in group'}
                  >
                    <input
                      type="checkbox"
                      className={styles.toggleInput}
                      checked={allEnabled}
                      ref={(el) => {
                        if (el) el.indeterminate = partial
                      }}
                      onChange={() => handleGroupToggle(group, groupSkillsList)}
                    />
                    <span
                      className={`${styles.toggleTrack} ${partial ? styles.togglePartial : ''}`}
                    />
                  </label>
                </div>

                {isOpen && (
                  <div className={styles.skillList}>
                    {groupSkillsList.map((skill) => (
                      <div key={`${skill.group}-${skill.id}`} className={styles.skillRow}>
                        <div className={styles.skillMeta}>
                          <div className={styles.skillName}>{skill.name}</div>
                          {skill.description && (
                            <div className={styles.skillDesc} title={skill.description}>
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
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
