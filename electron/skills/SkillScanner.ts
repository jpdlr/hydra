import { readFileSync, readdirSync, renameSync, existsSync, writeFileSync, statSync } from 'fs'
import { join } from 'path'
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
    return { claude, codex, opencode: [], scannedAt: new Date().toISOString() }
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
      const pluginEnabled = enabledPlugins[pluginKey] !== false
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
