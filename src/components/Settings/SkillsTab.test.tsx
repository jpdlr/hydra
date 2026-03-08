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
      ...window.hydra,
      scanSkills: vi.fn().mockResolvedValue(mockScanResult),
      toggleSkill: vi.fn().mockResolvedValue({ success: true }),
      renameAgent: vi.fn().mockResolvedValue(null)
    } as any
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders Claude skills by default', async () => {
    render(<SkillsTab />)
    await waitFor(() => {
      expect(screen.getByText('Brainstorming')).toBeTruthy()
      expect(screen.getByText('Commit')).toBeTruthy()
    })
    expect(screen.getByText('2 skills')).toBeTruthy()
  })

  it('switches to Codex skills', async () => {
    render(<SkillsTab />)
    await waitFor(() => {
      expect(screen.getByText('Brainstorming')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('Codex'))
    expect(screen.getByText('PDF')).toBeTruthy()
    expect(screen.getByText('1 skill')).toBeTruthy()
  })

  it('calls toggleSkill when user skill toggle is clicked', async () => {
    render(<SkillsTab />)
    await waitFor(() => {
      expect(screen.getByText('Commit')).toBeTruthy()
    })
    // Only user skills have individual toggles; Claude plugin skills do not
    const toggles = screen.getAllByRole('checkbox')
    fireEvent.click(toggles[0])
    expect(window.hydra.toggleSkill).toHaveBeenCalledWith({
      provider: 'claude',
      id: 'commit',
      enabled: false
    })
  })

  it('calls refresh when Refresh button clicked', async () => {
    render(<SkillsTab />)
    await waitFor(() => {
      expect(screen.getByText('Brainstorming')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('Refresh'))
    expect(window.hydra.scanSkills).toHaveBeenCalledTimes(2)
  })
})
