import { basename, join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import type {
  AgentState,
  AppConfig,
  UsageAgentDailyStat,
  UsageBudgetStatus,
  UsageDashboardOptions,
  UsageDashboardSnapshot,
  UsageDailySummary,
  UsageProjectDailyStat
} from '@shared/types'

const USAGE_SCHEMA_VERSION = 1
const MAX_RETAINED_DAYS = 60

interface StoredUsageAgent {
  agentId: string
  agentName: string
  projectDir: string
  projectName: string
  provider: AgentState['provider']
  model: AgentState['model']
  tokens: number
  costUsd: number
  updatedAt: string
}

interface StoredUsageDay {
  date: string
  updatedAt: string
  agents: Record<string, StoredUsageAgent>
}

interface StoredBudgetAlertState {
  tokenWarningSent: boolean
  tokenExceededSent: boolean
  costWarningSent: boolean
  costExceededSent: boolean
}

interface UsageStore {
  schemaVersion: number
  days: Record<string, StoredUsageDay>
  alerts: Record<string, StoredBudgetAlertState>
}

export interface UsageBudgetAlert {
  date: string
  metric: 'tokens' | 'cost'
  level: 'warning' | 'exceeded'
  usage: number
  budget: number
  percent: number
}

interface UsageSignals {
  tokenCount: number | null
  costSessionUsd: number | null
  costTodayUsd: number | null
}

const ANSI_REGEX =
  /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07|\x1b[()][AB012]|\x1b\[[?]?[0-9;]*[hlm]|\x1b[=>]/g // eslint-disable-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0e-\x1f\x7f]/g // eslint-disable-line no-control-regex

const TOKEN_ONLY_PATTERN = /^\s*([0-9][0-9,]*)\s*\((?:[0-9]{1,3})%\)\s*$/
const TOKEN_COUNT_PREFIX_PATTERN = /\b(?:token count|tokens?)\s*[:=]\s*([0-9][0-9,]*)\b/i
const TOKEN_COUNT_SUFFIX_PATTERN = /\b([0-9][0-9,]*)\s*tokens?\b/i
const CONTEXT_USAGE_PATTERN = /\bcontext(?:\s+used)?\s*[:=]?\s*([0-9][0-9,]*)\s*(?:\/\s*[0-9][0-9,]*)?/i
const MAX_TOKEN_SIGNAL = 100_000_000

const COST_SESSION_CC_PATTERN = /\$([0-9]+(?:\.[0-9]+)?)\s*cc(?!usage)\b/i

const COST_TODAY_PATTERNS = [
  /\$([0-9]+(?:\.[0-9]+)?)\s*(?:cc|session|run|block|hr)?\s*\/\s*\$([0-9]+(?:\.[0-9]+)?)\s*today/i,
  /\$([0-9]+(?:\.[0-9]+)?)\s*today\b/i,
  /\btoday\b[^$]*\$([0-9]+(?:\.[0-9]+)?)/i
]

export class UsageTracker {
  private readonly usagePath: string
  private store: UsageStore

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true })
    this.usagePath = join(dataDir, 'usage.json')
    this.store = this.load()
  }

  recordAgentOutput(
    agent: AgentState,
    rawData: string,
    config: AppConfig,
    now: Date = new Date()
  ): { changed: boolean; alerts: UsageBudgetAlert[]; summary: UsageDailySummary | null } {
    const signals = parseUsageSignals(rawData)
    if (signals.tokenCount === null && signals.costSessionUsd === null && signals.costTodayUsd === null) {
      return { changed: false, alerts: [], summary: null }
    }

    const dateKey = toDateKey(now)
    this.pruneOldDays()

    const day = this.ensureDay(dateKey, now)
    const existing = day.agents[agent.id] ?? this.createStoredAgent(agent, now)

    let changed = false
    if (!day.agents[agent.id]) {
      day.agents[agent.id] = existing
      changed = true
    }

    if (existing.agentName !== agent.name) {
      existing.agentName = agent.name
      changed = true
    }
    if (existing.projectDir !== agent.projectDir) {
      existing.projectDir = agent.projectDir
      existing.projectName = basename(agent.projectDir) || agent.projectDir || 'Workspace'
      changed = true
    }
    if (existing.provider !== agent.provider) {
      existing.provider = agent.provider
      changed = true
    }
    if (existing.model !== agent.model) {
      existing.model = agent.model
      changed = true
    }

    if (signals.tokenCount !== null && signals.tokenCount > existing.tokens) {
      existing.tokens = Math.round(signals.tokenCount)
      changed = true
    }
    const agentCost = signals.costSessionUsd ?? signals.costTodayUsd
    if (agentCost !== null && agentCost > existing.costUsd) {
      existing.costUsd = roundCost(agentCost)
      changed = true
    }

    if (!changed) {
      return { changed: false, alerts: [], summary: null }
    }

    existing.updatedAt = now.toISOString()
    day.updatedAt = existing.updatedAt

    const summary = this.buildDaySummary(dateKey)
    const alerts = summary ? this.evaluateBudgetTransitions(dateKey, summary, config) : []
    this.save()
    return { changed: true, alerts, summary }
  }

  getDashboard(config: AppConfig, options?: UsageDashboardOptions): UsageDashboardSnapshot {
    const dayLimit = Math.max(1, Math.min(90, options?.days ?? 14))
    this.pruneOldDays()

    const days = Object.keys(this.store.days)
      .sort((a, b) => b.localeCompare(a))
      .slice(0, dayLimit)
      .map((date) => this.buildDaySummary(date))
      .filter((summary): summary is UsageDailySummary => summary !== null)

    const todayDate = toDateKey(new Date())
    const today =
      days.find((summary) => summary.date === todayDate) ??
      this.buildDaySummary(todayDate) ??
      createEmptyDaySummary(todayDate)

    const finalDays = [...days]
    if (!finalDays.some((summary) => summary.date === today.date)) {
      finalDays.unshift(today)
    }

    if (finalDays.length > dayLimit) {
      finalDays.length = dayLimit
    }

    return {
      generatedAt: new Date().toISOString(),
      today,
      days: finalDays,
      budget: buildBudgetStatus(today, config)
    }
  }

  private createStoredAgent(agent: AgentState, now: Date): StoredUsageAgent {
    return {
      agentId: agent.id,
      agentName: agent.name,
      projectDir: agent.projectDir,
      projectName: basename(agent.projectDir) || agent.projectDir || 'Workspace',
      provider: agent.provider,
      model: agent.model,
      tokens: 0,
      costUsd: 0,
      updatedAt: now.toISOString()
    }
  }

  private ensureDay(dateKey: string, now: Date): StoredUsageDay {
    if (!this.store.days[dateKey]) {
      this.store.days[dateKey] = {
        date: dateKey,
        updatedAt: now.toISOString(),
        agents: {}
      }
    }

    if (!this.store.alerts[dateKey]) {
      this.store.alerts[dateKey] = {
        tokenWarningSent: false,
        tokenExceededSent: false,
        costWarningSent: false,
        costExceededSent: false
      }
    }

    return this.store.days[dateKey]
  }

  private buildDaySummary(dateKey: string): UsageDailySummary | null {
    const day = this.store.days[dateKey]
    if (!day) return null

    const agents: UsageAgentDailyStat[] = Object.values(day.agents)
      .map((agent) => ({
        ...agent,
        tokens: Math.max(0, Math.round(agent.tokens)),
        costUsd: roundCost(agent.costUsd)
      }))
      .sort((a, b) => {
        if (b.costUsd !== a.costUsd) return b.costUsd - a.costUsd
        if (b.tokens !== a.tokens) return b.tokens - a.tokens
        return a.agentName.localeCompare(b.agentName)
      })

    let totalTokens = 0
    let totalCost = 0
    const projects = new Map<string, UsageProjectDailyStat>()
    const projectAgentSets = new Map<string, Set<string>>()

    for (const agent of agents) {
      totalTokens += agent.tokens
      totalCost += agent.costUsd

      const existingProject = projects.get(agent.projectDir) ?? {
        projectDir: agent.projectDir,
        projectName: agent.projectName,
        agentCount: 0,
        tokens: 0,
        costUsd: 0
      }
      existingProject.tokens += agent.tokens
      existingProject.costUsd += agent.costUsd
      projects.set(agent.projectDir, existingProject)

      if (!projectAgentSets.has(agent.projectDir)) {
        projectAgentSets.set(agent.projectDir, new Set())
      }
      projectAgentSets.get(agent.projectDir)!.add(agent.agentId)
    }

    const projectList: UsageProjectDailyStat[] = Array.from(projects.values())
      .map((project) => ({
        ...project,
        agentCount: projectAgentSets.get(project.projectDir)?.size ?? 0,
        tokens: Math.round(project.tokens),
        costUsd: roundCost(project.costUsd)
      }))
      .sort((a, b) => {
        if (b.costUsd !== a.costUsd) return b.costUsd - a.costUsd
        if (b.tokens !== a.tokens) return b.tokens - a.tokens
        return a.projectName.localeCompare(b.projectName)
      })

    return {
      date: day.date,
      tokens: Math.round(totalTokens),
      costUsd: roundCost(totalCost),
      updatedAt: day.updatedAt,
      agents,
      projects: projectList
    }
  }

  private evaluateBudgetTransitions(
    dateKey: string,
    summary: UsageDailySummary,
    config: AppConfig
  ): UsageBudgetAlert[] {
    const alerts: UsageBudgetAlert[] = []
    const state = this.store.alerts[dateKey]
    if (!state) return alerts

    const warningThreshold = clampWarningThreshold(config.usageBudgetWarningThresholdPct)
    const tokenBudget = config.usageDailyTokenBudget > 0 ? config.usageDailyTokenBudget : 0
    const costBudget = config.usageDailyCostBudgetUsd > 0 ? config.usageDailyCostBudgetUsd : 0

    if (tokenBudget > 0) {
      const thresholdValue = tokenBudget * (warningThreshold / 100)
      if (summary.tokens >= thresholdValue && !state.tokenWarningSent) {
        state.tokenWarningSent = true
        alerts.push({
          date: dateKey,
          metric: 'tokens',
          level: 'warning',
          usage: summary.tokens,
          budget: tokenBudget,
          percent: (summary.tokens / tokenBudget) * 100
        })
      }
      if (summary.tokens >= tokenBudget && !state.tokenExceededSent) {
        state.tokenExceededSent = true
        alerts.push({
          date: dateKey,
          metric: 'tokens',
          level: 'exceeded',
          usage: summary.tokens,
          budget: tokenBudget,
          percent: (summary.tokens / tokenBudget) * 100
        })
      }
    }

    if (costBudget > 0) {
      const thresholdValue = costBudget * (warningThreshold / 100)
      if (summary.costUsd >= thresholdValue && !state.costWarningSent) {
        state.costWarningSent = true
        alerts.push({
          date: dateKey,
          metric: 'cost',
          level: 'warning',
          usage: roundCost(summary.costUsd),
          budget: roundCost(costBudget),
          percent: (summary.costUsd / costBudget) * 100
        })
      }
      if (summary.costUsd >= costBudget && !state.costExceededSent) {
        state.costExceededSent = true
        alerts.push({
          date: dateKey,
          metric: 'cost',
          level: 'exceeded',
          usage: roundCost(summary.costUsd),
          budget: roundCost(costBudget),
          percent: (summary.costUsd / costBudget) * 100
        })
      }
    }

    return alerts
  }

  private load(): UsageStore {
    try {
      if (existsSync(this.usagePath)) {
        const parsed = JSON.parse(readFileSync(this.usagePath, 'utf-8')) as Partial<UsageStore>
        if (parsed && typeof parsed === 'object') {
          return {
            schemaVersion: USAGE_SCHEMA_VERSION,
            days: sanitizeDayMap(parsed.days),
            alerts: sanitizeAlertMap(parsed.alerts)
          }
        }
      }
    } catch {
      // Best effort load. Corrupted state resets to empty.
    }

    return {
      schemaVersion: USAGE_SCHEMA_VERSION,
      days: {},
      alerts: {}
    }
  }

  private save(): void {
    try {
      writeFileSync(this.usagePath, JSON.stringify(this.store, null, 2), 'utf-8')
    } catch {
      // Best effort persistence.
    }
  }

  private pruneOldDays(): void {
    const dayKeys = Object.keys(this.store.days).sort((a, b) => b.localeCompare(a))
    if (dayKeys.length <= MAX_RETAINED_DAYS) return

    for (const key of dayKeys.slice(MAX_RETAINED_DAYS)) {
      delete this.store.days[key]
      delete this.store.alerts[key]
    }
    this.save()
  }
}

function sanitizeDayMap(input: unknown): Record<string, StoredUsageDay> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, StoredUsageDay> = {}

  for (const [date, day] of Object.entries(input as Record<string, unknown>)) {
    if (!day || typeof day !== 'object') continue
    const dayObject = day as Partial<StoredUsageDay>
    if (typeof dayObject.date !== 'string') continue
    const agents = sanitizeAgentMap(dayObject.agents)
    out[date] = {
      date: dayObject.date,
      updatedAt: typeof dayObject.updatedAt === 'string' ? dayObject.updatedAt : new Date().toISOString(),
      agents
    }
  }

  return out
}

function sanitizeAgentMap(input: unknown): Record<string, StoredUsageAgent> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, StoredUsageAgent> = {}

  for (const [agentId, value] of Object.entries(input as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const entry = value as Partial<StoredUsageAgent>
    if (
      typeof entry.agentId !== 'string' ||
      typeof entry.agentName !== 'string' ||
      typeof entry.projectDir !== 'string' ||
      typeof entry.projectName !== 'string' ||
      typeof entry.provider !== 'string' ||
      typeof entry.model !== 'string'
    ) {
      continue
    }

    out[agentId] = {
      agentId: entry.agentId,
      agentName: entry.agentName,
      projectDir: entry.projectDir,
      projectName: entry.projectName,
      provider: entry.provider,
      model: entry.model,
      tokens: sanitizeTokenCount(entry.tokens),
      costUsd: typeof entry.costUsd === 'number' && Number.isFinite(entry.costUsd) ? Math.max(0, entry.costUsd) : 0,
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date().toISOString()
    }
  }

  return out
}

function sanitizeAlertMap(input: unknown): Record<string, StoredBudgetAlertState> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, StoredBudgetAlertState> = {}

  for (const [date, value] of Object.entries(input as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const entry = value as Partial<StoredBudgetAlertState>
    out[date] = {
      tokenWarningSent: entry.tokenWarningSent === true,
      tokenExceededSent: entry.tokenExceededSent === true,
      costWarningSent: entry.costWarningSent === true,
      costExceededSent: entry.costExceededSent === true
    }
  }

  return out
}

function parseUsageSignals(rawData: string): UsageSignals {
  const cleaned = rawData.replace(ANSI_REGEX, '').replace(CONTROL_CHARS, '')
  const lines = cleaned.split(/\r?\n/)

  let tokenCount: number | null = null
  let costSessionUsd: number | null = null
  let costTodayUsd: number | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const tokenOnlyMatch = trimmed.match(TOKEN_ONLY_PATTERN)
    if (tokenOnlyMatch?.[1]) {
      const parsed = parseTokenCount(tokenOnlyMatch[1])
      if (parsed !== null) {
        tokenCount = tokenCount === null ? parsed : Math.max(tokenCount, parsed)
      }
    }

    const tokenPrefixMatch = trimmed.match(TOKEN_COUNT_PREFIX_PATTERN)
    if (tokenPrefixMatch?.[1]) {
      const parsed = parseTokenCount(tokenPrefixMatch[1])
      if (parsed !== null) {
        tokenCount = tokenCount === null ? parsed : Math.max(tokenCount, parsed)
      }
    }

    const contextUsageMatch = trimmed.match(CONTEXT_USAGE_PATTERN)
    if (contextUsageMatch?.[1]) {
      const parsed = parseTokenCount(contextUsageMatch[1])
      if (parsed !== null) {
        tokenCount = tokenCount === null ? parsed : Math.max(tokenCount, parsed)
      }
    }

    const directTokenMatch = trimmed.match(TOKEN_COUNT_SUFFIX_PATTERN)
    if (directTokenMatch?.[1]) {
      const parsed = parseTokenCount(directTokenMatch[1])
      if (parsed !== null) {
        tokenCount = tokenCount === null ? parsed : Math.max(tokenCount, parsed)
      }
    }

    // Extract per-session cost from "$X.XX cc" (not "ccusage")
    const sessionCcMatch = trimmed.match(COST_SESSION_CC_PATTERN)
    if (sessionCcMatch?.[1]) {
      const candidate = parseNumeric(sessionCcMatch[1])
      if (candidate !== null) {
        costSessionUsd = costSessionUsd === null ? candidate : Math.max(costSessionUsd, candidate)
      }
    }

    for (const pattern of COST_TODAY_PATTERNS) {
      const match = trimmed.match(pattern)
      if (!match) continue
      const candidate = parseNumeric(match[2] ?? match[1] ?? '')
      if (candidate === null) continue
      costTodayUsd = costTodayUsd === null ? candidate : Math.max(costTodayUsd, candidate)

      // If the pattern matched "$X unit / $Y today", group 1 is the per-session cost
      if (match[2] !== undefined && match[1] !== undefined) {
        const sessionCandidate = parseNumeric(match[1])
        if (sessionCandidate !== null) {
          costSessionUsd = costSessionUsd === null ? sessionCandidate : Math.max(costSessionUsd, sessionCandidate)
        }
      }
    }
  }

  return { tokenCount, costSessionUsd, costTodayUsd }
}

function parseNumeric(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(/,/g, ''))
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

function parseTokenCount(value: string): number | null {
  const parsed = parseNumeric(value)
  if (parsed === null) return null
  if (parsed > MAX_TOKEN_SIGNAL) return null
  return parsed
}

function sanitizeTokenCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0
  }
  if (value > MAX_TOKEN_SIGNAL) {
    return 0
  }
  return value
}

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function clampWarningThreshold(value: number): number {
  if (!Number.isFinite(value)) return 80
  return Math.min(99, Math.max(1, Math.round(value)))
}

function roundCost(value: number): number {
  return Math.round(value * 10000) / 10000
}

function buildBudgetStatus(today: UsageDailySummary | null, config: AppConfig): UsageBudgetStatus {
  const threshold = clampWarningThreshold(config.usageBudgetWarningThresholdPct)
  const tokenBudget = config.usageDailyTokenBudget > 0 ? config.usageDailyTokenBudget : null
  const costBudget = config.usageDailyCostBudgetUsd > 0 ? config.usageDailyCostBudgetUsd : null

  const tokenUsage = today?.tokens ?? 0
  const costUsage = today?.costUsd ?? 0

  const tokenUsagePct = tokenBudget ? (tokenUsage / tokenBudget) * 100 : null
  const costUsagePct = costBudget ? (costUsage / costBudget) * 100 : null

  return {
    dailyTokenBudget: tokenBudget,
    dailyCostBudgetUsd: costBudget,
    warningThresholdPct: threshold,
    tokenUsagePct,
    costUsagePct,
    tokenWarningReached: tokenBudget ? tokenUsage >= tokenBudget * (threshold / 100) : false,
    costWarningReached: costBudget ? costUsage >= costBudget * (threshold / 100) : false,
    tokenBudgetExceeded: tokenBudget ? tokenUsage >= tokenBudget : false,
    costBudgetExceeded: costBudget ? costUsage >= costBudget : false
  }
}

function createEmptyDaySummary(date: string): UsageDailySummary {
  return {
    date,
    tokens: 0,
    costUsd: 0,
    updatedAt: new Date().toISOString(),
    agents: [],
    projects: []
  }
}
