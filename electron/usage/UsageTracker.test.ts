import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { UsageTracker } from './UsageTracker'
import { DEFAULT_CONFIG, type AgentState } from '@shared/types'

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hydra-usage-'))
  tempDirs.push(dir)
  return dir
}

function makeAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 'agent-a',
    name: 'Agent A',
    projectDir: '/tmp/project-a',
    provider: 'claude',
    model: 'sonnet',
    yolo: false,
    isManager: false,
    sessionId: null,
    initialPrompt: '',
    createdAt: '2026-02-09T12:00:00.000Z',
    status: 'running',
    pid: 123,
    restartCount: 0,
    startedAt: '2026-02-09T12:00:00.000Z',
    lastActivityAt: '2026-02-09T12:00:00.000Z',
    ...overrides
  }
}

describe('UsageTracker', () => {
  afterEach(() => {
    vi.useRealTimers()
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('aggregates usage per day, project, and agent from PTY output', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-09T13:10:00.000Z'))

    const tracker = new UsageTracker(makeTempDir())
    const config = { ...DEFAULT_CONFIG }

    const first = tracker.recordAgentOutput(
      makeAgent(),
      '106,903 (11%)\n$0.40 cc / $3.42 today\n',
      config,
      new Date('2026-02-09T13:00:00.000Z')
    )

    expect(first.changed).toBe(true)
    expect(first.summary?.tokens).toBe(106903)
    // Uses per-session cc cost ($0.40), not cumulative today cost ($3.42)
    expect(first.summary?.costUsd).toBe(0.4)
    expect(first.summary?.projects).toHaveLength(1)
    expect(first.summary?.projects[0]).toMatchObject({
      projectDir: '/tmp/project-a',
      agentCount: 1,
      tokens: 106903,
      costUsd: 0.4
    })

    const second = tracker.recordAgentOutput(
      makeAgent({ id: 'agent-b', name: 'Agent B' }),
      'token count: 120\n$0.10 cc / $0.58 today\n',
      config,
      new Date('2026-02-09T13:05:00.000Z')
    )

    expect(second.changed).toBe(true)
    expect(second.summary?.tokens).toBe(107023)
    // Sum of per-session costs: $0.40 + $0.10 = $0.50
    expect(second.summary?.costUsd).toBe(0.5)
    expect(second.summary?.projects[0]?.agentCount).toBe(2)
    expect(second.summary?.agents).toHaveLength(2)

    const dashboard = tracker.getDashboard(config, { days: 7 })
    expect(dashboard.days).toHaveLength(1)
    expect(dashboard.today?.tokens).toBe(107023)
    expect(dashboard.today?.projects[0]?.tokens).toBe(107023)
  })

  it('emits budget warning and exceeded alerts once per day', () => {
    const tracker = new UsageTracker(makeTempDir())
    const config = {
      ...DEFAULT_CONFIG,
      usageDailyTokenBudget: 1000,
      usageDailyCostBudgetUsd: 10,
      usageBudgetWarningThresholdPct: 80
    }

    const warning = tracker.recordAgentOutput(
      makeAgent(),
      'token count: 820\n$5.00 cc / $7.50 today\n',
      config,
      new Date('2026-02-09T15:00:00.000Z')
    )
    expect(warning.alerts).toHaveLength(1)
    expect(warning.alerts[0]).toMatchObject({
      metric: 'tokens',
      level: 'warning'
    })

    const exceeded = tracker.recordAgentOutput(
      makeAgent(),
      '1,230 (23%)\n$10.50 cc / $15.00 today\n',
      config,
      new Date('2026-02-09T15:02:00.000Z')
    )
    expect(exceeded.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: 'tokens', level: 'exceeded' }),
        expect.objectContaining({ metric: 'cost', level: 'warning' }),
        expect.objectContaining({ metric: 'cost', level: 'exceeded' })
      ])
    )

    const repeat = tracker.recordAgentOutput(
      makeAgent(),
      '1,400 (28%)\n$12.00 cc / $18.00 today\n',
      config,
      new Date('2026-02-09T15:10:00.000Z')
    )
    expect(repeat.alerts).toHaveLength(0)
  })

  it('returns a synthetic today summary when no usage has been recorded yet', () => {
    const tracker = new UsageTracker(makeTempDir())
    const dashboard = tracker.getDashboard(DEFAULT_CONFIG, { days: 7 })

    expect(dashboard.today).not.toBeNull()
    expect(dashboard.today?.tokens).toBe(0)
    expect(dashboard.today?.costUsd).toBe(0)
    expect(dashboard.days).toHaveLength(1)
    expect(dashboard.days[0].date).toBe(dashboard.today?.date)
  })

  it('ignores large IDs on ccusage lines when parsing token usage', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-10T12:00:00.000Z'))

    const tracker = new UsageTracker(makeTempDir())
    const result = tracker.recordAgentOutput(
      makeAgent(),
      [
        'ccusage report: https://example.com/ccusage/sessions/8067667186175',
        '31,900 (8%)',
        '$0.12 cc / $19.09 today'
      ].join('\n'),
      DEFAULT_CONFIG,
      new Date('2026-02-10T12:00:00.000Z')
    )

    expect(result.changed).toBe(true)
    expect(result.summary?.tokens).toBe(31900)
    // Uses per-session cc cost ($0.12), not cumulative today cost ($19.09)
    expect(result.summary?.costUsd).toBe(0.12)
  })

  it('sanitizes malformed persisted token outliers', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-10T12:00:00.000Z'))

    const dir = makeTempDir()
    writeFileSync(
      join(dir, 'usage.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          days: {
            '2026-02-10': {
              date: '2026-02-10',
              updatedAt: '2026-02-10T12:00:00.000Z',
              agents: {
                'agent-a': {
                  agentId: 'agent-a',
                  agentName: 'Agent A',
                  projectDir: '/tmp/project-a',
                  projectName: 'project-a',
                  provider: 'claude',
                  model: 'sonnet',
                  tokens: 8_067_667_186_175,
                  costUsd: 19.09,
                  updatedAt: '2026-02-10T12:00:00.000Z'
                }
              }
            }
          },
          alerts: {}
        },
        null,
        2
      ),
      'utf-8'
    )

    const tracker = new UsageTracker(dir)
    const dashboard = tracker.getDashboard(DEFAULT_CONFIG, { days: 7 })
    expect(dashboard.today?.tokens).toBe(0)
    expect(dashboard.today?.costUsd).toBe(19.09)
  })
})
