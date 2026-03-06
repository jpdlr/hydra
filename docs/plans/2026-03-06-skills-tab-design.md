# Skills Tab Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Skills tab in Settings that shows installed skills for Claude and Codex providers, with toggles to enable/disable each.

**Architecture:** New `SkillScanner` service in `electron/skills/` scans filesystem skill directories for both providers. Exposed via REST endpoint on daemon (`GET /skills`, `POST /skills/toggle`), IPC channels (`SKILLS_SCAN`, `SKILLS_TOGGLE`), and preload bridge. New `SkillsTab` React component renders skills grouped by provider with toggle switches.

**Tech Stack:** Node.js fs for scanning, YAML frontmatter parsing (simple regex — no new dep), Zod validation on IPC, React + CSS Modules for UI.

---

### Task 1: Add shared types for skills

**Files:**
- Modify: `shared/types.ts`

**Step 1: Add skill-related types and IPC channels**

Add after the Remote Control types section (~line 509):

```typescript
// ── Skills ──────────────────────────────────────────────────────────────────

export interface SkillInfo {
  id: string
  name: string
  description: string
  provider: ProviderId
  /** For Claude: plugin name (e.g. "superpowers@claude-plugins-official"). For Codex: skill directory name. */
  group: string
  enabled: boolean
  /** Filesystem path to the SKILL.md (or SKILL.md.disabled) */
  path: string
}

export interface SkillScanResult {
  claude: SkillInfo[]
  codex: SkillInfo[]
  scannedAt: string
}

export interface SkillTogglePayload {
  provider: ProviderId
  /** For Claude: the plugin key (e.g. "superpowers@claude-plugins-official"). For Codex: the skill id. */
  id: string
  enabled: boolean
}
```

Add to the `IPC` const:

```typescript
  // Skills
  SKILLS_SCAN: 'skills:scan',
  SKILLS_TOGGLE: 'skills:toggle',
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (new types are additive, no breaking changes)

**Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat(skills): add shared types and IPC channels for skill scanning"
```

---

### Task 2: Create SkillScanner service

**Files:**
- Create: `electron/skills/SkillScanner.ts`

**Step 1: Create the SkillScanner**

```typescript
import { readFileSync, readdirSync, renameSync, existsSync, writeFileSync, statSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'
import type { ProviderId, SkillInfo, SkillScanResult, SkillTogglePayload } from '@shared/types'

/** Parse YAML frontmatter from a SKILL.md file to extract name and description. */
function parseFrontmatter(content: string): { name: string; description: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!match) return { name: '', description: '' }
  const yaml = match[1]
  const nameMatch = yaml.match(/^name:\s*(.+)$/m)
  const descMatch = yaml.match(/^description:\s*(.+)$/m)
  return {
    name: nameMatch ? nameMatch[1].trim() : '',
    description: descMatch ? descMatch[1].trim() : ''
  }
}

function titleCase(s: string): string {
  return s
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function scanSkillDir(
  dirPath: string,
  provider: ProviderId,
  group: string
): SkillInfo[] {
  if (!existsSync(dirPath)) return []
  const skills: SkillInfo[] = []

  let entries: string[]
  try {
    entries = readdirSync(dirPath)
  } catch {
    return []
  }

  for (const entry of entries) {
    const entryPath = join(dirPath, entry)
    try {
      if (!statSync(entryPath).isDirectory()) continue
    } catch {
      continue
    }

    const enabledPath = join(entryPath, 'SKILL.md')
    const disabledPath = join(entryPath, 'SKILL.md.disabled')
    let enabled = true
    let skillPath = ''

    if (existsSync(enabledPath)) {
      skillPath = enabledPath
      enabled = true
    } else if (existsSync(disabledPath)) {
      skillPath = disabledPath
      enabled = false
    } else {
      continue // Not a skill directory
    }

    try {
      const content = readFileSync(skillPath, 'utf-8')
      const fm = parseFrontmatter(content)
      skills.push({
        id: entry,
        name: fm.name || titleCase(entry),
        description: fm.description || '',
        provider,
        group,
        enabled,
        path: skillPath
      })
    } catch {
      // Skip unreadable files
    }
  }

  return skills
}

export class SkillScanner {
  private readonly home = homedir()

  scan(): SkillScanResult {
    const claude = this.scanClaude()
    const codex = this.scanCodex()
    return { claude, codex, scannedAt: new Date().toISOString() }
  }

  toggle(payload: SkillTogglePayload): boolean {
    if (payload.provider === 'claude') {
      return this.toggleClaude(payload)
    }
    return this.toggleCodex(payload)
  }

  // ── Claude ──────────────────────────────────────────────────────────────

  private scanClaude(): SkillInfo[] {
    const skills: SkillInfo[] = []

    // Read installed plugins to know what's installed
    const settingsPath = join(this.home, '.claude', 'settings.json')
    const installedPath = join(this.home, '.claude', 'plugins', 'installed_plugins.json')

    let enabledPlugins: Record<string, boolean> = {}
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      enabledPlugins = settings.enabledPlugins || {}
    } catch {
      // No settings file
    }

    let installedPlugins: Record<string, Array<{ installPath: string }>> = {}
    try {
      const installed = JSON.parse(readFileSync(installedPath, 'utf-8'))
      installedPlugins = installed.plugins || {}
    } catch {
      // No installed plugins
    }

    // Scan each installed plugin for skills
    for (const [pluginKey, installs] of Object.entries(installedPlugins)) {
      if (!installs || installs.length === 0) continue
      const install = installs[installs.length - 1] // Latest install
      const pluginEnabled = enabledPlugins[pluginKey] !== false // Default to enabled if not in settings
      const skillsDir = join(install.installPath, 'skills')
      const pluginSkills = scanSkillDir(skillsDir, 'claude', pluginKey)
      for (const skill of pluginSkills) {
        skill.enabled = pluginEnabled
        skills.push(skill)
      }
    }

    // Also scan user-created skills in ~/.claude/skills/
    const userSkills = scanSkillDir(join(this.home, '.claude', 'skills'), 'claude', 'user')
    skills.push(...userSkills)

    return skills
  }

  private toggleClaude(payload: SkillTogglePayload): boolean {
    // Claude toggles entire plugins via settings.json enabledPlugins
    const settingsPath = join(this.home, '.claude', 'settings.json')
    try {
      let settings: Record<string, unknown> = {}
      if (existsSync(settingsPath)) {
        settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      }
      const enabledPlugins = (settings.enabledPlugins || {}) as Record<string, boolean>
      enabledPlugins[payload.id] = payload.enabled
      settings.enabledPlugins = enabledPlugins
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
      return true
    } catch {
      return false
    }
  }

  // ── Codex ───────────────────────────────────────────────────────────────

  private scanCodex(): SkillInfo[] {
    const skills: SkillInfo[] = []

    // Scan ~/.agents/skills/ (the discovery directory)
    const agentsSkillsDir = join(this.home, '.agents', 'skills')
    if (existsSync(agentsSkillsDir)) {
      let entries: string[]
      try {
        entries = readdirSync(agentsSkillsDir)
      } catch {
        entries = []
      }

      for (const entry of entries) {
        const entryPath = join(agentsSkillsDir, entry)
        try {
          const stat = statSync(entryPath)
          if (!stat.isDirectory()) continue
        } catch {
          continue
        }

        // Check if this is a skill pack (contains sub-skills like superpowers/)
        const subSkillsDir = join(entryPath, 'skills')
        if (existsSync(subSkillsDir)) {
          const subSkills = scanSkillDir(subSkillsDir, 'codex', entry)
          skills.push(...subSkills)
        } else {
          // Direct skill directory
          const enabledPath = join(entryPath, 'SKILL.md')
          const disabledPath = join(entryPath, 'SKILL.md.disabled')
          let enabled = true
          let skillPath = ''

          if (existsSync(enabledPath)) {
            skillPath = enabledPath
          } else if (existsSync(disabledPath)) {
            skillPath = disabledPath
            enabled = false
          } else {
            continue
          }

          try {
            const content = readFileSync(skillPath, 'utf-8')
            const fm = parseFrontmatter(content)
            skills.push({
              id: entry,
              name: fm.name || titleCase(entry),
              description: fm.description || '',
              provider: 'codex',
              group: 'agents',
              enabled,
              path: skillPath
            })
          } catch {
            // Skip
          }
        }
      }
    }

    // Also scan curated skills
    const curatedDir = join(this.home, '.codex', 'vendor_imports', 'skills', 'skills', '.curated')
    const curatedSkills = scanSkillDir(curatedDir, 'codex', 'curated')
    skills.push(...curatedSkills)

    return skills
  }

  private toggleCodex(payload: SkillTogglePayload): boolean {
    // For Codex: rename SKILL.md <-> SKILL.md.disabled
    // First try ~/.agents/skills/ paths (including sub-skill packs)
    const searchDirs = [
      join(this.home, '.agents', 'skills'),
      join(this.home, '.codex', 'vendor_imports', 'skills', 'skills', '.curated')
    ]

    for (const baseDir of searchDirs) {
      // Direct skill
      const directEnabled = join(baseDir, payload.id, 'SKILL.md')
      const directDisabled = join(baseDir, payload.id, 'SKILL.md.disabled')
      if (existsSync(directEnabled) || existsSync(directDisabled)) {
        return this.renameSkillFile(directEnabled, directDisabled, payload.enabled)
      }

      // Sub-skill in a pack (e.g., superpowers/skills/<id>/)
      try {
        for (const pack of readdirSync(baseDir)) {
          const packSkillPath = join(baseDir, pack, 'skills', payload.id)
          const packEnabled = join(packSkillPath, 'SKILL.md')
          const packDisabled = join(packSkillPath, 'SKILL.md.disabled')
          if (existsSync(packEnabled) || existsSync(packDisabled)) {
            return this.renameSkillFile(packEnabled, packDisabled, payload.enabled)
          }
        }
      } catch {
        // Directory may not exist
      }
    }

    return false
  }

  private renameSkillFile(enabledPath: string, disabledPath: string, enable: boolean): boolean {
    try {
      if (enable && existsSync(disabledPath)) {
        renameSync(disabledPath, enabledPath)
        return true
      }
      if (!enable && existsSync(enabledPath)) {
        renameSync(enabledPath, disabledPath)
        return true
      }
      return true // Already in desired state
    } catch {
      return false
    }
  }
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add electron/skills/SkillScanner.ts
git commit -m "feat(skills): add SkillScanner service for filesystem skill discovery"
```

---

### Task 3: Add daemon REST endpoints

**Files:**
- Modify: `electron/daemon/DaemonServer.ts`

**Step 1: Import SkillScanner and add to constructor**

Add import at top:
```typescript
import { SkillScanner } from '../skills/SkillScanner'
```

Add to `DaemonServerOptions`:
```typescript
  skillScanner: SkillScanner
```

Add as class field:
```typescript
  private readonly skillScanner: SkillScanner
```

Set in constructor:
```typescript
  this.skillScanner = options.skillScanner
```

**Step 2: Add REST routes before the 404**

Add before the `// 404` line:

```typescript
      // ── Skills ────────────────────────────────────────────────────────
      if (method === 'GET' && path === '/skills') {
        return this.json(res, 200, this.skillScanner.scan())
      }

      if (method === 'POST' && path === '/skills/toggle') {
        const body = await this.readBody<{ provider: string; id: string; enabled: boolean }>(req)
        const success = this.skillScanner.toggle({
          provider: body.provider as 'claude' | 'codex',
          id: body.id,
          enabled: body.enabled
        })
        return this.json(res, 200, { success })
      }
```

**Step 3: Update daemon entry to create SkillScanner**

Modify: `electron/daemon/index.ts`

Add import:
```typescript
import { SkillScanner } from '../skills/SkillScanner'
```

Create instance and pass to DaemonServer constructor:
```typescript
const skillScanner = new SkillScanner()
```

Pass `skillScanner` in the DaemonServer options object.

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/daemon/DaemonServer.ts electron/daemon/index.ts
git commit -m "feat(skills): add /skills and /skills/toggle daemon REST endpoints"
```

---

### Task 4: Add DaemonClient methods

**Files:**
- Modify: `electron/daemon/DaemonClient.ts`

**Step 1: Add imports**

Add to the import from `@shared/types`:
```typescript
  SkillScanResult,
  SkillTogglePayload
```

**Step 2: Add methods before the Shutdown section**

```typescript
  // ── Skills ─────────────────────────────────────────────────────────────

  async scanSkills(): Promise<SkillScanResult> {
    return this.httpRequest('GET', '/skills')
  }

  async toggleSkill(payload: SkillTogglePayload): Promise<{ success: boolean }> {
    return this.post('/skills/toggle', payload)
  }
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add electron/daemon/DaemonClient.ts
git commit -m "feat(skills): add scanSkills and toggleSkill to DaemonClient"
```

---

### Task 5: Add IPC handlers and preload bridge

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`

**Step 1: Add IPC handlers**

In `handlers.ts`, add Zod schemas near the top:
```typescript
const skillToggleSchema = z.object({
  provider: providerSchema,
  id: z.string().trim().min(1).max(256),
  enabled: z.boolean()
})
```

Add handlers at end of `registerIpcHandlers` (before the closing brace), after the Remote Control section:

```typescript
  // ── Skills ───────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.SKILLS_SCAN, async () => {
    return daemonClient.scanSkills()
  })

  ipcMain.handle(IPC.SKILLS_TOGGLE, async (_event, payload: unknown) => {
    return daemonClient.toggleSkill(skillToggleSchema.parse(payload))
  })
```

**Step 2: Add preload bridge methods**

In `preload.ts`, add to imports from `@shared/types`:
```typescript
  SkillScanResult,
  SkillTogglePayload
```

Add to the `hydraApi` object:
```typescript
  // Skills
  scanSkills: (): Promise<SkillScanResult> =>
    ipcRenderer.invoke(IPC.SKILLS_SCAN),
  toggleSkill: (payload: SkillTogglePayload): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC.SKILLS_TOGGLE, payload),
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add electron/ipc/handlers.ts electron/preload.ts
git commit -m "feat(skills): add IPC handlers and preload bridge for skill scanning"
```

---

### Task 6: Create SkillsTab component

**Files:**
- Create: `src/components/Settings/SkillsTab.tsx`
- Create: `src/components/Settings/SkillsTab.module.css`

**Step 1: Create the CSS module**

```css
.container {
  padding: var(--space-4) var(--space-5);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.providerBar {
  display: flex;
  background: var(--color-surface-hover);
  border-radius: var(--radius-md);
  padding: 2px;
}

.providerBtn {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-muted);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  text-align: center;
}

.providerBtn:hover {
  color: var(--color-text-secondary);
}

.providerBtnActive {
  background: var(--color-surface);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-sm);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.count {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.refreshBtn {
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  transition: background var(--transition-fast), color var(--transition-fast);
}

.refreshBtn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.groupLabel {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding-bottom: var(--space-1);
}

.skillRow {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
}

.skillRow:last-child {
  border-bottom: none;
}

.skillMeta {
  flex: 1;
  min-width: 0;
}

.skillName {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.skillDesc {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Toggle switch */
.toggle {
  position: relative;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
}

.toggleInput {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.toggleTrack {
  position: absolute;
  inset: 0;
  background: var(--color-surface-hover);
  border-radius: 10px;
  border: 1px solid var(--color-border);
  transition: background var(--transition-fast), border-color var(--transition-fast);
  cursor: pointer;
}

.toggleTrack::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  background: var(--color-text-muted);
  border-radius: 50%;
  transition: transform var(--transition-fast), background var(--transition-fast);
}

.toggleInput:checked + .toggleTrack {
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.toggleInput:checked + .toggleTrack::after {
  transform: translateX(16px);
  background: white;
}

.empty {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-6) 0;
}

.loading {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-6) 0;
}
```

**Step 2: Create the SkillsTab component**

```tsx
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
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/Settings/SkillsTab.tsx src/components/Settings/SkillsTab.module.css
git commit -m "feat(skills): add SkillsTab component with provider toggle and skill list"
```

---

### Task 7: Wire SkillsTab into SettingsPanel

**Files:**
- Modify: `src/components/Settings/SettingsPanel.tsx`

**Step 1: Add import and tab type**

Add import:
```typescript
import { SkillsTab } from './SkillsTab'
```

Update tab type:
```typescript
type SettingsTab = 'general' | 'shortcuts' | 'skills'
```

**Step 2: Add tab button**

Add a third button inside the segmented control after the Shortcuts button:
```tsx
<button
  className={`${styles.segment} ${activeTab === 'skills' ? styles.active : ''}`}
  onClick={() => setActiveTab('skills')}
>
  Skills
</button>
```

**Step 3: Add tab render**

Add after `{activeTab === 'shortcuts' && <ShortcutsTab />}`:
```tsx
{activeTab === 'skills' && <SkillsTab />}
```

**Step 4: Run typecheck and dev server**

Run: `npm run typecheck`
Expected: PASS

Run: `npm run dev`
Expected: Settings modal shows three tabs: General, Shortcuts, Skills

**Step 5: Commit**

```bash
git add src/components/Settings/SettingsPanel.tsx
git commit -m "feat(skills): wire SkillsTab into settings panel"
```

---

### Task 8: Update test mocks

**Files:**
- Modify: All test files that set `window.hydra = {...}`

**Step 1: Find and update all test files with window.hydra mocks**

Search for `window.hydra` in test files and add the new methods to each mock:

```typescript
scanSkills: vi.fn().mockResolvedValue({ claude: [], codex: [], scannedAt: '' }),
toggleSkill: vi.fn().mockResolvedValue({ success: true }),
```

**Step 2: Run all tests**

Run: `npm test`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add -A
git commit -m "test: update window.hydra mocks with skill scanning methods"
```

---

### Task 9: Add SkillsTab test

**Files:**
- Create: `src/components/Settings/SkillsTab.test.tsx`

**Step 1: Write the test**

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SkillsTab } from './SkillsTab'
import type { SkillScanResult } from '@shared/types'

const mockScanResult: SkillScanResult = {
  claude: [
    {
      id: 'brainstorming',
      name: 'Brainstorming',
      description: 'Creative brainstorming skill',
      provider: 'claude',
      group: 'superpowers@claude-plugins-official',
      enabled: true,
      path: '/home/user/.claude/plugins/cache/superpowers/skills/brainstorming/SKILL.md'
    },
    {
      id: 'commit',
      name: 'Commit',
      description: 'Commit message generator',
      provider: 'claude',
      group: 'user',
      enabled: true,
      path: '/home/user/.claude/skills/commit/SKILL.md'
    }
  ],
  codex: [
    {
      id: 'pdf',
      name: 'PDF',
      description: 'Create and review PDFs',
      provider: 'codex',
      group: 'curated',
      enabled: true,
      path: '/home/user/.codex/vendor_imports/skills/skills/.curated/pdf/SKILL.md'
    }
  ],
  scannedAt: '2026-03-06T00:00:00.000Z'
}

describe('SkillsTab', () => {
  beforeEach(() => {
    window.hydra = {
      scanSkills: vi.fn().mockResolvedValue(mockScanResult),
      toggleSkill: vi.fn().mockResolvedValue({ success: true })
    } as any
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders Claude skills by default', async () => {
    render(<SkillsTab />)
    await waitFor(() => {
      expect(screen.getByText('Brainstorming')).toBeInTheDocument()
      expect(screen.getByText('Commit')).toBeInTheDocument()
    })
    expect(screen.getByText('2 skills')).toBeInTheDocument()
  })

  it('switches to Codex skills', async () => {
    render(<SkillsTab />)
    await waitFor(() => {
      expect(screen.getByText('Brainstorming')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Codex'))
    expect(screen.getByText('PDF')).toBeInTheDocument()
    expect(screen.getByText('1 skill')).toBeInTheDocument()
  })

  it('calls toggleSkill when toggle is clicked', async () => {
    render(<SkillsTab />)
    await waitFor(() => {
      expect(screen.getByText('Brainstorming')).toBeInTheDocument()
    })
    const toggles = screen.getAllByRole('checkbox')
    fireEvent.click(toggles[0])
    expect(window.hydra.toggleSkill).toHaveBeenCalledWith({
      provider: 'claude',
      id: 'superpowers@claude-plugins-official',
      enabled: false
    })
  })

  it('calls refresh when Refresh button clicked', async () => {
    render(<SkillsTab />)
    await waitFor(() => {
      expect(screen.getByText('Brainstorming')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Refresh'))
    expect(window.hydra.scanSkills).toHaveBeenCalledTimes(2)
  })
})
```

**Step 2: Run the test**

Run: `npx vitest run src/components/Settings/SkillsTab.test.tsx`
Expected: All 4 tests PASS

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/components/Settings/SkillsTab.test.tsx
git commit -m "test: add SkillsTab component tests"
```
