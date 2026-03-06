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
    // Optimistic update
    setResult((prev) => {
      if (!prev) return prev
      const key = skill.provider === 'claude' ? 'claude' : 'codex'
      return {
        ...prev,
        [key]: prev[key].map((s) => {
          // For Claude: toggle all skills in the same plugin group
          if (skill.provider === 'claude' && skill.group !== 'user') {
            return s.group === skill.group ? { ...s, enabled: newEnabled } : s
          }
          return s.id === skill.id && s.group === skill.group ? { ...s, enabled: newEnabled } : s
        })
      }
    })

    // For Claude, toggle by group (plugin key). For Codex, toggle by skill id.
    const toggleId = skill.provider === 'claude' && skill.group !== 'user' ? skill.group : skill.id
    const { success } = await window.hydra.toggleSkill({
      provider: skill.provider,
      id: toggleId,
      enabled: newEnabled
    })

    if (!success) {
      // Revert on failure
      refresh()
    }
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
        Array.from(grouped.entries()).map(([group, groupSkills]) => (
          <div key={group} className={styles.group}>
            <span className={styles.groupLabel}>{group}</span>
            {groupSkills.map((skill) => (
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
        ))}
    </div>
  )
}
